import SwiftUI

/// A changed file's status the way the desktop's file tree shows it: a letter in
/// its color (A/U added, D deleted, R renamed, M modified, ! conflicted), plus the
/// jump menu's symbol and a spoken name.
struct GitFileStatus {
    let letter: String
    let color: Color
    let symbol: String
    let spoken: String

    init(_ status: String) {
        switch status {
        case "added": (letter, color, symbol, spoken) = ("A", .green, "plus.circle", "Added")
        case "untracked": (letter, color, symbol, spoken) = ("U", .green, "questionmark.circle", "Untracked")
        case "deleted": (letter, color, symbol, spoken) = ("D", .red, "minus.circle", "Deleted")
        case "renamed": (letter, color, symbol, spoken) = ("R", .cyan, "arrow.right.circle", "Renamed")
        case "conflicted": (letter, color, symbol, spoken) = ("!", .red, "exclamationmark.triangle", "Merge conflict")
        default: (letter, color, symbol, spoken) = ("M", .blue, "pencil.circle", "Modified")
        }
    }
}

extension GitFile {
    var name: String { (path as NSString).lastPathComponent }
    var directory: String { (path as NSString).deletingLastPathComponent }
}

/// The status letter on a tinted rounded square, in front of a file's name.
struct GitStatusBadge: View {
    let status: String

    var body: some View {
        let s = GitFileStatus(status)
        Text(s.letter)
            .font(.system(size: 11, weight: .bold, design: .rounded))
            .foregroundStyle(s.color)
            .frame(width: 18, height: 18)
            .background(s.color.opacity(0.15), in: RoundedRectangle(cornerRadius: 5, style: .continuous))
            .accessibilityLabel(s.spoken)
    }
}

/// A file's name over its folder, the name carrying the weight.
struct GitFileName: View {
    let file: GitFile

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(file.name)
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)
                .truncationMode(.middle)
            if !file.directory.isEmpty {
                Text(file.directory)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.head)
            }
        }
    }
}

/// The per-file "+N −M" change counts shown once the diff has parsed.
struct DiffStat: View {
    let added: Int
    let removed: Int

    var body: some View {
        HStack(spacing: 6) {
            if added > 0 {
                Text("+\(added)").foregroundStyle(.green)
            }
            if removed > 0 {
                Text("−\(removed)").foregroundStyle(.red)
            }
        }
        .font(.system(size: 12, weight: .semibold, design: .monospaced))
        .monospacedDigit()
    }
}

/// The top of the review: how many files changed and how many are viewed, over a
/// bar that fills as files are marked viewed.
struct ReviewSummary: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    var title: String?
    let total: Int
    let viewed: Int

    private var done: Bool { total > 0 && viewed == total }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            let layout = typeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
                : AnyLayout(HStackLayout(alignment: .firstTextBaseline))
            layout {
                Text(title ?? "\(total) file\(total == 1 ? "" : "s") changed")
                    .font(.subheadline.weight(.semibold))
                if !typeSize.isAccessibilitySize { Spacer(minLength: 8) }
                HStack(spacing: 4) {
                    if done {
                        Image(systemName: "checkmark.circle.fill")
                    }
                    Text("\(viewed) of \(total) viewed")
                }
                .font(.footnote.weight(.medium))
                .foregroundStyle(done ? .green : .secondary)
                .monospacedDigit()
            }
            GeometryReader { geo in
                Capsule()
                    .fill(Color(.tertiarySystemFill))
                    .overlay(alignment: .leading) {
                        Capsule()
                            .fill(.green)
                            .frame(width: geo.size.width * CGFloat(viewed) / CGFloat(max(total, 1)))
                    }
            }
            .frame(height: 4)
            .animation(.easeInOut(duration: 0.25), value: viewed)
            .accessibilityHidden(true)
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 14)
        .accessibilityElement(children: .combine)
    }
}

/// The two-line nav title: "Changes" over the aggregate +A −D, GitHub-style. Its
/// own view so that reading every file's parsed diff (which the aggregate genuinely
/// depends on) re-evaluates only this title as parses land, not the whole file list.
struct ChangesTitle: View {
    @Environment(AppModel.self) private var model
    let project: String
    /// The files to total instead of the snapshot's, read under `project`.
    var files: [GitFile]?

    private var totals: (added: Int, removed: Int) {
        var added = 0, removed = 0
        for file in files ?? model.git.snapshots[project]?.files ?? [] {
            if let parsed = model.git.parsedDiff(project, path: file.path) {
                added += parsed.addedCount
                removed += parsed.removedCount
            }
        }
        return (added, removed)
    }

    var body: some View {
        let t = totals
        VStack(spacing: 1) {
            Text("Changes").font(.headline)
            if t.added > 0 || t.removed > 0 {
                HStack(spacing: 6) {
                    Text("+\(t.added)").foregroundStyle(.green)
                    Text("−\(t.removed)").foregroundStyle(.red)
                }
                .font(.footnote.weight(.semibold))
                .monospacedDigit()
            }
        }
    }
}

/// The review's one action, pinned under the list so it stays in reach however
/// far the diffs scroll: it opens the commit sheet.
struct CommitBar: View {
    let selected: Int
    let committing: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if committing {
                    ProgressView().controlSize(.small).tint(.white)
                } else {
                    Image(systemName: "checkmark.circle")
                }
                Text(selected > 0 ? "Commit \(selected) file\(selected == 1 ? "" : "s")" : "Commit")
                    .fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .disabled(committing)
        .bottomBar()
    }
}

struct InlineNote: View {
    let icon: String
    let text: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
            Text(text)
            Spacer(minLength: 0)
        }
        .font(.footnote)
        .foregroundStyle(.secondary)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }
}

struct InlineDiffLoading: View {
    var body: some View {
        HStack(spacing: 10) {
            ProgressView().controlSize(.small)
            Text("Loading diff…")
                .font(.footnote)
                .foregroundStyle(.secondary)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}

struct InlineDiffError: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle")
                .foregroundStyle(.orange)
            Text(message)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .lineLimit(2)
            Spacer(minLength: 8)
            Button("Retry", action: retry)
                .font(.footnote.weight(.semibold))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}

/// Loading ghost for the review screen, matching the summary + file-header layout.
struct GitReviewSkeleton: View {
    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    SkeletonBar(width: 120)
                    Capsule().fill(Color(.tertiarySystemFill)).frame(height: 4)
                }
                .padding(.vertical, 6)
                .shimmer()
            }
            Section {
                ForEach([160.0, 120.0, 190.0, 140.0], id: \.self) { w in
                    HStack(spacing: 10) {
                        RoundedRectangle(cornerRadius: 5, style: .continuous)
                            .fill(Color(.tertiarySystemFill))
                            .frame(width: 18, height: 18)
                        SkeletonBar(width: w)
                        Spacer()
                    }
                    .shimmer()
                }
            }
        }
        .listStyle(.plain)
        .scrollDisabled(true)
        .allowsHitTesting(false)
        .transition(.opacity)
    }
}

extension View {
    /// The pinned bar under the review and the commit sheet.
    func bottomBar() -> some View {
        padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 6)
            .background(.bar)
    }
}

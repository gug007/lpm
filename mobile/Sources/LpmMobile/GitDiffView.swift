import SwiftUI
import UIKit

/// A single file's unified diff, full-screen: added lines tinted green, removed
/// red, hunk headers dimmed, file headers dimmed. Lines never wrap — the whole
/// diff scrolls horizontally — and the vertical list is lazy so a
/// thousands-of-lines diff stays smooth. The line parsing and per-line rendering
/// (`ParsedDiff` / `DiffLineRow`) are shared with the inline diffs on the review
/// screen.
struct GitDiffView: View {
    @EnvironmentObject var model: AppModel
    let project: String
    let file: GitFile

    private var key: String { model.diffKey(project, file.path) }
    private var result: GitDiffResult? { model.gitDiffs[key] }
    private var error: String? { model.gitDiffError[key] }

    var body: some View {
        Group {
            if let result {
                if result.binary {
                    DiffPlaceholder(icon: "doc.badge.gearshape", title: "Binary file",
                                    message: "This file's contents can't be shown as text.")
                } else if result.diff.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    DiffPlaceholder(icon: "doc.plaintext", title: "No changes",
                                    message: "There's nothing to show for this file.")
                } else if let parsed = model.parsedDiff(project, path: file.path) {
                    DiffContent(parsed: parsed, truncated: result.truncated)
                }
            } else if let error {
                DiffErrorView(message: error) { model.loadGitDiff(project, path: file.path) }
            } else {
                DiffLoadingView()
            }
        }
        .navigationTitle((file.path as NSString).lastPathComponent)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { model.loadGitDiff(project, path: file.path) }
    }
}

enum DiffLineKind {
    case added, removed, hunk, context
}

struct DiffLine: Identifiable {
    let id: Int
    let text: String
    let kind: DiffLineKind
    // For a hunk line: the compact "@@ <new-start>" label; empty otherwise. The
    // trailing context snippet (if any) is kept in `text`.
    let hunkLabel: String
}

/// A diff parsed into classified lines plus the pixel width of its longest line,
/// so every line's tint can extend to a common width and short lines still fill
/// the row. File-header noise (diff --git / index / --- / +++ / mode / rename
/// lines and the "\ No newline" marker) is dropped — the file name already lives
/// in the section header and nav title. Computed once per file and cached.
struct ParsedDiff {
    let lines: [DiffLine]
    let contentWidth: CGFloat

    private static let font = UIFont.monospacedSystemFont(ofSize: 13, weight: .regular)
    private static let charWidth: CGFloat = ("0" as NSString).size(withAttributes: [.font: font]).width

    init(_ diff: String) {
        let parsed = Self.parse(diff)
        lines = parsed
        let longest = parsed.map(\.text.count).max() ?? 0
        contentWidth = CGFloat(longest) * Self.charWidth + 24
    }

    static func parse(_ diff: String) -> [DiffLine] {
        var out: [DiffLine] = []
        for sub in diff.split(separator: "\n", omittingEmptySubsequences: false) {
            let line = String(sub)
            if isFileHeader(line) || line.hasPrefix("\\") { continue }
            let kind: DiffLineKind
            var text = line
            var hunkLabel = ""
            if line.hasPrefix("@@") {
                kind = .hunk
                let hunk = parseHunk(line)
                hunkLabel = hunk.label
                text = hunk.context
            } else if line.hasPrefix("+") {
                kind = .added
            } else if line.hasPrefix("-") {
                kind = .removed
            } else {
                kind = .context
            }
            out.append(DiffLine(id: out.count, text: text, kind: kind, hunkLabel: hunkLabel))
        }
        return out
    }

    private static func isFileHeader(_ line: String) -> Bool {
        line.hasPrefix("diff --git") || line.hasPrefix("index ")
            || line.hasPrefix("--- ") || line.hasPrefix("+++ ")
            || line.hasPrefix("new file") || line.hasPrefix("deleted file")
            || line.hasPrefix("rename ") || line.hasPrefix("copy ")
            || line.hasPrefix("similarity ") || line.hasPrefix("dissimilarity ")
            || line.hasPrefix("old mode") || line.hasPrefix("new mode")
    }

    /// Turns "@@ -190,7 +190,10 @@ export default function…" into ("@@ 190",
    /// "export default function…"): the new-file start line and the trailing
    /// context that git echoes after the closing "@@".
    private static func parseHunk(_ line: String) -> (label: String, context: String) {
        guard let open = line.range(of: "@@"),
              let close = line.range(of: "@@", range: open.upperBound..<line.endIndex) else {
            return ("@@", "")
        }
        let middle = line[open.upperBound..<close.lowerBound]
        let context = String(line[close.upperBound...]).trimmingCharacters(in: .whitespaces)
        var newStart = ""
        if let plus = middle.range(of: "+") {
            newStart = String(middle[plus.upperBound...].prefix { $0.isNumber })
        }
        return (newStart.isEmpty ? "@@" : "@@ \(newStart)", context)
    }
}

/// One diff line. A hunk renders as a slim full-width separator band (a compact
/// "@@ <line>" plus any context snippet); every other line renders as its
/// non-wrapping code, tinted by kind and stretched to a shared width so
/// backgrounds align across the horizontally scrolling column.
struct DiffLineRow: View {
    let line: DiffLine
    let width: CGFloat

    var body: some View {
        if line.kind == .hunk {
            HunkSeparator(label: line.hunkLabel, context: line.text, width: width)
        } else {
            Text(line.text.isEmpty ? " " : line.text)
                .font(.system(size: 13, design: .monospaced))
                .foregroundStyle(.primary)
                .fixedSize(horizontal: true, vertical: false)
                .padding(.horizontal, 12)
                .padding(.vertical, 1)
                .frame(minWidth: width, alignment: .leading)
                .background(Self.background(line.kind))
        }
    }

    static func background(_ kind: DiffLineKind) -> Color {
        switch kind {
        case .added: return Color.green.opacity(0.16)
        case .removed: return Color.red.opacity(0.16)
        default: return .clear
        }
    }
}

/// A slim band marking a hunk boundary: reads as a visual break between hunks,
/// not a line of code.
private struct HunkSeparator: View {
    let label: String
    let context: String
    let width: CGFloat

    var body: some View {
        HStack(spacing: 8) {
            Text(label)
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .foregroundStyle(.secondary)
            if !context.isEmpty {
                Text(context)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 5)
        .frame(width: width, alignment: .leading)
        .background(Color(.secondarySystemFill))
    }
}

private struct DiffContent: View {
    let parsed: ParsedDiff
    let truncated: Bool

    var body: some View {
        VStack(spacing: 0) {
            if truncated {
                TruncatedNotice()
            }
            ScrollView([.horizontal, .vertical]) {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(parsed.lines) { line in
                        DiffLineRow(line: line, width: parsed.contentWidth)
                    }
                }
            }
        }
        .background(Color(.systemBackground))
    }
}

private struct TruncatedNotice: View {
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "scissors")
            Text("This diff is large and was truncated.")
            Spacer()
        }
        .font(.footnote)
        .foregroundStyle(.secondary)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color(.secondarySystemBackground))
    }
}

private struct DiffPlaceholder: View {
    let icon: String
    let title: String
    let message: String

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: icon)
        } description: {
            Text(message)
        }
    }
}

private struct DiffLoadingView: View {
    var body: some View {
        VStack(spacing: 12) {
            ProgressView()
            Text("Loading diff…")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct DiffErrorView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label("Couldn't load the diff", systemImage: "exclamationmark.triangle")
        } description: {
            Text(message)
        } actions: {
            Button("Try Again", action: retry)
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.capsule)
        }
    }
}

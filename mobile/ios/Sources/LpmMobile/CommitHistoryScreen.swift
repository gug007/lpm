import SwiftUI

/// The desktop's History for a project: the current branch's commits, newest
/// first, the ones no remote has yet marked, and a line where the pushed ones
/// start. A commit opens its message, its files and their patches.
struct CommitHistoryScreen: View {
    @Environment(AppModel.self) private var model
    let project: Project
    // Asked once per visit: coming back from a commit keeps the older pages.
    @State private var asked = false

    private var log: GitHistoryStore.Log { model.gitHistory.log(project.name) }
    private var branch: String { model.git.snapshots[project.name]?.branch ?? "" }

    var body: some View {
        let log = log
        let boundary = log.commits.remoteBoundary
        List {
            if log.commits.isEmpty {
                emptyState(log)
            }
            ForEach(Array(log.commits.enumerated()), id: \.element.id) { index, commit in
                if index == boundary {
                    PushedDivider()
                }
                NavigationLink {
                    CommitDetailScreen(project: project.name, commit: commit)
                } label: {
                    HistoryCommitRow(commit: commit)
                }
            }
            if log.hasMore {
                Button {
                    model.gitHistory.loadMore(project.name)
                } label: {
                    Text(log.loading ? "Loading…" : "Load older commits")
                        .font(.subheadline)
                        .frame(maxWidth: .infinity)
                }
                .disabled(log.loading)
            }
        }
        .listStyle(.plain)
        .refreshable { await model.gitHistory.refresh(project.name) }
        .navigationTitle("History")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) { title(log) }
        }
        .task(id: model.connection == .ready) {
            guard model.connection == .ready, !asked else { return }
            asked = true
            model.gitHistory.load(project.name)
        }
    }

    @ViewBuilder
    private func emptyState(_ log: GitHistoryStore.Log) -> some View {
        if let error = log.error {
            InlineDiffError(message: error) { model.gitHistory.load(project.name) }
                .listRowInsets(EdgeInsets())
        } else if log.loaded && !log.loading {
            Text("No commits on this branch yet.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        } else {
            HStack(spacing: 10) {
                ProgressView().controlSize(.small)
                Text("Loading history…")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func title(_ log: GitHistoryStore.Log) -> some View {
        let unpushed = log.commits.filter(\.unpushed).count
        let more = log.hasMore && unpushed == log.commits.count ? "+" : ""
        return VStack(spacing: 1) {
            Text("History")
                .font(.headline)
            HStack(spacing: 4) {
                if !branch.isEmpty {
                    Text(branch)
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
                if unpushed > 0 {
                    if !branch.isEmpty { Text("·").foregroundStyle(.secondary) }
                    Text("\(unpushed)\(more) not pushed")
                        .foregroundStyle(.cyan)
                }
            }
            .font(.caption)
        }
        .accessibilityElement(children: .combine)
    }
}

/// One commit: its mark, what it says, who wrote it and when.
struct HistoryCommitRow: View {
    let commit: HistoryCommit

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            CommitMark(commit: commit)
                .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + 4 }
            VStack(alignment: .leading, spacing: 3) {
                Text(commit.subject)
                    .font(.subheadline)
                    .lineLimit(2)
                HStack(spacing: 4) {
                    if let agent = commit.agent, let mark = AgentMark(agent) {
                        mark.frame(width: 12, height: 12)
                            .accessibilityLabel("With \(commit.coAuthorNames.first ?? agent)")
                    }
                    Text(commit.author)
                        .lineLimit(1)
                    Text("·")
                    Text(commit.short)
                        .monospaced()
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            Spacer(minLength: 6)
            VStack(alignment: .trailing, spacing: 3) {
                Text(relativeAgo(commit.time))
                    .font(.caption)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
                if commit.unpushed {
                    Text("↑")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.cyan)
                        .accessibilityLabel("Not pushed yet")
                }
            }
        }
        .padding(.vertical, 2)
    }
}

/// The commit's mark says what it is by shape as well as color, as on the
/// desktop: filled for one no remote has yet, a ring once pushed, a diamond for
/// a merge.
struct CommitMark: View {
    let commit: HistoryCommit

    var body: some View {
        Group {
            if commit.isMerge {
                RoundedRectangle(cornerRadius: 1.5)
                    .strokeBorder(Color.secondary, lineWidth: 1.2)
                    .frame(width: 8, height: 8)
                    .rotationEffect(.degrees(45))
            } else if commit.unpushed {
                Circle().fill(Color.cyan).frame(width: 9, height: 9)
            } else {
                Circle().strokeBorder(Color.secondary, lineWidth: 1.2).frame(width: 9, height: 9)
            }
        }
        .frame(width: 12)
        .accessibilityHidden(true)
    }
}

/// The line above the first commit a remote already has.
private struct PushedDivider: View {
    var body: some View {
        HStack(spacing: 8) {
            Rectangle().fill(Color(.separator)).frame(height: 1)
            Text("PUSHED")
                .font(.system(size: 10, weight: .semibold))
                .tracking(0.6)
                .foregroundStyle(.secondary)
            Rectangle().fill(Color(.separator)).frame(height: 1)
        }
        .listRowSeparator(.hidden)
        .accessibilityLabel("Pushed")
    }
}

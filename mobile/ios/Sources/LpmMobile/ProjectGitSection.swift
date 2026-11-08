import SwiftUI

/// The project's Git under its tabs: the branch and how far it is from its
/// upstream, the uncommitted changes, and CI, each opening what the ⋯ menu's
/// items open. Nothing shows for a folder that isn't a repository.
struct ProjectGitSection: View {
    @Environment(AppModel.self) private var model
    let project: String
    let screens: ProjectGitScreens

    private var snapshot: GitSnapshot? { model.git.snapshots[project] }
    private var checks: GitChecks? { model.gitChecks.available ? model.gitChecks.checks(project) : nil }

    var body: some View {
        if let snapshot, snapshot.isRepo {
            Section {
                GitSectionRow(symbol: "arrow.trianglehead.branch",
                              title: snapshot.detached ? "Detached HEAD" : snapshot.branch,
                              monospaced: !snapshot.detached, action: { screens.branch = true }) {
                    UpstreamCounts(ahead: snapshot.ahead, behind: snapshot.behind)
                }
                GitSectionRow(symbol: "checklist", title: "Changes", action: { screens.changes = true }) {
                    ChangeCounts(snapshot: snapshot)
                }
                if let checks, let verdict = checks.verdict {
                    GitSectionRow(ciState: verdict,
                                  title: checks.pr.map { "CI on #\($0.number)" } ?? "CI",
                                  action: { screens.checks = true }) {
                        Text(checks.label)
                            .foregroundStyle(verdict == .fail ? Color.red : Color.secondary)
                    }
                }
            } header: {
                SectionTitle(text: "Git")
            }
        }
    }
}

private struct GitSectionRow<Trailing: View>: View {
    var symbol = ""
    var ciState: CiCheck.State?
    let title: String
    var monospaced = false
    let action: () -> Void
    @ViewBuilder let trailing: Trailing

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Group {
                    if let ciState {
                        CiStateIcon(state: ciState)
                    } else {
                        Image(systemName: symbol).foregroundStyle(.secondary)
                    }
                }
                .font(.system(size: 15))
                .frame(width: 24)
                Text(title)
                    .font(monospaced ? .body.monospaced() : .body)
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .foregroundStyle(.primary)
                Spacer(minLength: 8)
                trailing
                    .font(.subheadline)
                    .monospacedDigit()
                    .lineLimit(1)
                    .layoutPriority(1)
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
            .frame(minHeight: 36)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .compactRow()
    }
}

/// "↑2 ↓1": commits to push and to pull; nothing while the branch is even.
private struct UpstreamCounts: View {
    let ahead: Int
    let behind: Int

    var body: some View {
        HStack(spacing: 6) {
            if ahead > 0 { Text("↑\(ahead)") }
            if behind > 0 { Text("↓\(behind)") }
        }
        .foregroundStyle(.secondary)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
    }

    private var label: String {
        [ahead > 0 ? "\(ahead) to push" : "", behind > 0 ? "\(behind) to pull" : ""]
            .filter { !$0.isEmpty }.joined(separator: ", ")
    }
}

/// "+52 −5 · 4 files", or "None" for a clean tree.
private struct ChangeCounts: View {
    let snapshot: GitSnapshot

    var body: some View {
        Group {
            if snapshot.files.isEmpty {
                Text("None")
            } else {
                ChangesLine.summary(snapshot, spacing: 4)
            }
        }
        .foregroundStyle(.secondary)
    }
}

import SwiftUI

/// Asks the Mac about a project's CI while its screen is up: every 20 s while a
/// check runs, a minute otherwise, and 5 s after a push or a branch switch (a
/// push lands on GitHub a moment after git moves, and its checks a moment after
/// that). A local commit tells GitHub nothing, so it asks nothing.
struct GitChecksFollower: ViewModifier {
    @Environment(AppModel.self) private var model
    let project: String
    @State private var asked: String?

    private struct FollowKey: Equatable {
        let project: String
        let pending: Bool
    }

    private var pending: Bool { model.gitChecks.checks(project)?.verdict == .pending }
    private var snapshot: GitSnapshot? { model.git.snapshots[project] }

    func body(content: Content) -> some View {
        content
            .task(id: FollowKey(project: project, pending: pending)) {
                guard model.gitChecks.available else { return }
                let wait: UInt64 = (pending ? 20 : 60) * 1_000_000_000
                // Checks starting or finishing came with an answer; the next
                // one is a wait away.
                if asked == project { try? await Task.sleep(nanoseconds: wait) }
                asked = project
                while !Task.isCancelled {
                    model.gitChecks.load(project)
                    try? await Task.sleep(nanoseconds: wait)
                }
            }
            .onChange(of: snapshot?.branch) { _, _ in reloadSoon() }
            .onChange(of: snapshot?.ahead) { old, new in
                if let old, let new, new < old { reloadSoon() }
            }
    }

    private func reloadSoon() {
        Task {
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            model.gitChecks.load(project)
        }
    }
}

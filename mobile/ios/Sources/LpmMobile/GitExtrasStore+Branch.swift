import Foundation

/// The branch's own changes since it left its base, for Changes' Branch scope.
/// Their diffs live in the review store beside the uncommitted ones, under
/// `branchKey(project)`, so a file section and its Viewed mark work the same.
extension GitExtrasStore {
    nonisolated private static let branchSuffix = "\u{1}branch"

    nonisolated static func branchKey(_ project: String) -> String { project + branchSuffix }

    /// The project a branch key stands for; nil for a project's own key.
    nonisolated static func branchProject(_ key: String) -> String? {
        key.hasSuffix(branchSuffix) ? String(key.dropLast(branchSuffix.count)) : nil
    }

    var canBranchScope: Bool { has(LpmClient.gitBranchDiffFeature) }

    func loadBranch(_ project: String) {
        guard canBranchScope, !branchLoading.contains(project) else { return }
        branchLoading.insert(project)
        branchErrors[project] = nil
        client?.requestBranchFiles(project: project)
        timeout.arm("branch\u{0}" + project, seconds: 30) { [weak self] in
            guard let self, self.branchLoading.remove(project) != nil else { return }
            if !self.branchLoaded.contains(project) {
                self.branchErrors[project] = "Couldn't reach your Mac. Pull to refresh."
            }
        }
    }

    func applyBranchFiles(_ reply: BranchFilesReply) {
        let project = reply.project
        timeout.cancel("branch\u{0}" + project)
        branchLoading.remove(project)
        if let error = reply.error {
            branchErrors[project] = error
            return
        }
        let before = branchScopes[project]
        branchScopes[project] = reply.scope
        branchLoaded.insert(project)
        guard before != reply.scope else { return }
        model?.git.reconcileDiffs(Self.branchKey(project), keep: Set(reply.scope?.files.map(\.path) ?? [])) { _, _ in true }
    }
}

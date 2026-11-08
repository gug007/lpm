import Foundation

/// CI on each project's branch, reached as `model.gitChecks`: what the Mac last
/// said about it, running the failed jobs again, and merging the pull request
/// once it's ready. The screens showing it ask again while they're up.
@Observable @MainActor
final class GitChecksStore {
    @ObservationIgnored weak var model: AppModel?
    private var client: LpmClient? { model?.client }

    /// A project with no entry is unknown or has nothing to show.
    var results: [String: GitChecks] = [:]
    var rerunning: Set<String> = []
    var rerunErrors: [String: String] = [:]
    var merging: Set<String> = []
    var mergeErrors: [String: String] = [:]
    var merged: [String: MergedPullRequest] = [:]

    var available: Bool { client?.hostFeatures.contains(LpmClient.gitChecksFeature) == true }
    var canMerge: Bool { client?.hostFeatures.contains(LpmClient.gitMergeFeature) == true }

    func checks(_ project: String) -> GitChecks? { results[project] }

    func load(_ project: String) {
        guard available else { return }
        client?.requestGitChecks(project: project)
    }

    func apply(_ project: String, checks: GitChecks?, error: String?) {
        // A failed read keeps what was shown; nothing to show clears it.
        guard error == nil else { return }
        results[project] = checks
    }

    func rerun(_ project: String) {
        guard let checks = results[project] else { return }
        let ids = checks.failingRunIds
        guard !ids.isEmpty else { return }
        rerunErrors[project] = nil
        rerunning.insert(project)
        client?.requestGitChecksRerun(project: project, runIds: ids)
    }

    func applyRerun(_ project: String, error: String?) {
        rerunning.remove(project)
        if let error {
            rerunErrors[project] = error
            return
        }
        if let checks = results[project] {
            results[project] = checks.rerunning(checks.failingRunIds)
        }
        load(project)
    }

    func merge(_ project: String, method: GitMergeMethod, deleteBranch: Bool) {
        guard let pr = results[project]?.pr else { return }
        mergeErrors[project] = nil
        merging.insert(project)
        client?.requestGitMergePr(project: project, number: pr.number, method: method.rawValue,
                                  head: pr.merge?.head ?? "", deleteBranch: deleteBranch)
    }

    func applyMerge(_ project: String, number: Int, deletedBranch: Bool, error: String?) {
        merging.remove(project)
        if let error {
            mergeErrors[project] = error
            return
        }
        let title = results[project]?.pr.flatMap { $0.number == number ? $0.title : nil } ?? ""
        merged[project] = MergedPullRequest(number: number, title: title, deletedBranch: deletedBranch)
        load(project)
        model?.git.load(project)
    }

    /// The sheet closed: what it said about merging is done with.
    func forgetMerge(_ project: String) {
        merged[project] = nil
        mergeErrors[project] = nil
    }

    func handleConnectionReset() {
        rerunning = []
        merging = []
    }
}

extension AppModel {
    func wireGitChecks(_ c: LpmClient) {
        c.onGitChecks = { [weak self] project, checks, error in
            self?.gitChecks.apply(project, checks: checks, error: error)
        }
        c.onGitChecksRerun = { [weak self] project, error in
            self?.gitChecks.applyRerun(project, error: error)
        }
        c.onGitMergePr = { [weak self] project, number, deletedBranch, error in
            self?.gitChecks.applyMerge(project, number: number, deletedBranch: deletedBranch, error: error)
        }
    }
}

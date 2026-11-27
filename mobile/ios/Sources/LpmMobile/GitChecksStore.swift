import Foundation

/// CI on each project's branch, reached as `model.gitChecks`: what the Mac last
/// said about it, running the failed jobs again, and merging the pull request
/// once it's ready, and keeping an agent fixing until the checks pass. The
/// screens showing it ask again while they're up.
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
    /// Arming or cancelling Merge When Checks Pass, on its way to the Mac.
    var arming: Set<String> = []
    /// Keep fixing until green, by project: running, or how it lately ended.
    var loops: [String: CiFixLoop] = [:]
    var loopErrors: [String: String] = [:]

    var available: Bool { client?.hostFeatures.contains(LpmClient.gitChecksFeature) == true }
    var canMerge: Bool { client?.hostFeatures.contains(LpmClient.gitMergeFeature) == true }
    var canMergeWhenReady: Bool { client?.hostFeatures.contains(LpmClient.gitMergeWhenReadyFeature) == true }
    var canKeepFixing: Bool { client?.hostFeatures.contains(LpmClient.ciFixLoopFeature) == true }

    func checks(_ project: String) -> GitChecks? { results[project] }

    func load(_ project: String) {
        guard available else { return }
        client?.requestGitChecks(project: project)
    }

    func apply(_ project: String, checks: GitChecks?, error: String?) {
        // A failed read keeps what was shown; nothing to show clears it.
        guard error == nil else { return }
        results[project] = checks
        if let checks { loops[project] = checks.fixLoop }
    }

    /// Arms Keep fixing until green for the tab the project opens next; sent
    /// right before that tab is asked for.
    func startLoop(_ project: String, agent: String) {
        loopErrors[project] = nil
        client?.requestCiFixLoop(project: project, on: true, agent: agent)
    }

    func stopLoop(_ project: String) {
        loopErrors[project] = nil
        client?.requestCiFixLoop(project: project, on: false, agent: "")
    }

    func applyLoop(_ project: String, loop: CiFixLoop?, error: String?) {
        if let error {
            loopErrors[project] = error
            return
        }
        loops[project] = loop
        if let loop, !loop.running { load(project) }
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

    func merge(_ project: String, method: GitMergeMethod, deleteBranch: Bool, bypass: Bool = false) {
        guard let pr = results[project]?.pr else { return }
        mergeErrors[project] = nil
        merging.insert(project)
        client?.requestGitMergePr(project: project, number: pr.number, method: method.rawValue,
                                  head: pr.merge?.head ?? "", deleteBranch: deleteBranch, bypass: bypass)
    }

    /// Has the Mac merge the pull request the moment its last check passes
    /// (the desktop PR card's "When checks pass").
    func mergeWhenReady(_ project: String, method: GitMergeMethod, deleteBranch: Bool, bypass: Bool) {
        guard let pr = results[project]?.pr, !arming.contains(project) else { return }
        mergeErrors[project] = nil
        arming.insert(project)
        let watch = GitMergeWatch(number: pr.number, title: pr.title, method: method,
                                  deleteBranch: deleteBranch, bypass: bypass)
        results[project]?.mergeWatch = watch
        client?.requestGitMergePrWhenReady(project: project, watch: watch)
    }

    func cancelMergeWhenReady(_ project: String) {
        guard !arming.contains(project) else { return }
        mergeErrors[project] = nil
        arming.insert(project)
        client?.requestGitMergePrCancel(project: project)
    }

    func applyMergeWhenReady(_ project: String, cancel: Bool, error: String?) {
        arming.remove(project)
        if let error {
            mergeErrors[project] = error
            if !cancel { results[project]?.mergeWatch = nil }
            Haptics.error()
            return
        }
        if cancel { results[project]?.mergeWatch = nil } else { Haptics.success() }
    }

    /// How the Mac's wait to merge stands, wherever it was armed.
    func applyMergeWatch(_ project: String, watch: GitMergeWatch) {
        switch watch.state {
        case "waiting":
            results[project]?.mergeWatch = watch
        case "merged":
            results[project]?.mergeWatch = nil
            merged[project] = MergedPullRequest(number: watch.number, title: watch.title,
                                                deletedBranch: watch.deletedBranch,
                                                isGitLab: results[project]?.pr?.isGitLab ?? false)
            reloadMerged(project)
        case "stopped":
            results[project]?.mergeWatch = nil
            let ref = (results[project]?.pr?.isGitLab ?? false) ? "!\(watch.number)" : "#\(watch.number)"
            mergeErrors[project] = "Stopped waiting to merge \(ref). \(watch.reason ?? "")"
                .trimmingCharacters(in: .whitespaces)
            if results[project] != nil { load(project) }
        default:
            results[project]?.mergeWatch = nil
        }
    }

    func applyMerge(_ project: String, number: Int, deletedBranch: Bool, error: String?) {
        merging.remove(project)
        if let error {
            mergeErrors[project] = error
            return
        }
        let pr = results[project]?.pr.flatMap { $0.number == number ? $0 : nil }
        merged[project] = MergedPullRequest(number: number, title: pr?.title ?? "", deletedBranch: deletedBranch,
                                            isGitLab: pr?.isGitLab ?? false)
        reloadMerged(project)
    }

    /// A merge went through: the branch loads again, and the checks if this
    /// phone has them (the sheet loads its own when it opens).
    private func reloadMerged(_ project: String) {
        model?.noteWin()
        if results[project] != nil { load(project) }
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
        arming = []
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
        c.onCiFixLoop = { [weak self] project, loop, error in
            self?.gitChecks.applyLoop(project, loop: loop, error: error)
        }
        c.onGitMergePr = { [weak self] project, number, deletedBranch, error in
            self?.gitChecks.applyMerge(project, number: number, deletedBranch: deletedBranch, error: error)
        }
        c.onGitMergeWhenReady = { [weak self] project, cancel, error in
            self?.gitChecks.applyMergeWhenReady(project, cancel: cancel, error: error)
        }
        c.onGitMergeWatch = { [weak self] project, watch in
            self?.gitChecks.applyMergeWatch(project, watch: watch)
        }
    }
}

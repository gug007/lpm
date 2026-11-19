import Foundation

/// The review's extras, reached as `model.gitExtras`: the look for secrets before
/// a commit, the branch's own changes, the review on its pull request, why a
/// check failed, and saving an edit from the file preview. Each asks the Mac only
/// when its `features` says it answers.
@Observable @MainActor
final class GitExtrasStore {
    @ObservationIgnored weak var model: AppModel?
    var client: LpmClient? { model?.client }

    // The commit sheet's look for secrets: what's in the way of the commit asked
    // for, the lines the user waved through, and the commit waiting on the answer.
    var scanning: Set<String> = []
    var findings: [String: [SecretFinding]] = [:]
    @ObservationIgnored var ignoredFindings: [String: Set<String>] = [:]
    @ObservationIgnored var pendingCommits: [String: PendingCommit] = [:]

    // The branch's changes since its base, per project; a project loaded with
    // nothing to compare with is in `branchLoaded` without a scope.
    var branchScopes: [String: BranchScope] = [:]
    var branchLoaded: Set<String> = []
    var branchLoading: Set<String> = []
    var branchErrors: [String: String] = [:]

    var discussions: [String: PrDiscussion] = [:]
    @ObservationIgnored var discussionAsked: [String: Date] = [:]

    // Failed checks' logs, by `logKey`.
    var checkLogs: [String: CheckLog] = [:]
    var checkLogLoading: Set<String> = []
    var checkLogErrors: [String: String] = [:]

    @ObservationIgnored let saves = MacRequests<FileWriteReply>(timeout: .seconds(30))
    @ObservationIgnored let timeout = GenerationTimeout<String>()

    func has(_ feature: String) -> Bool { client?.hostFeatures.contains(feature) == true }

    func handleConnectionReset() {
        timeout.cancelAll()
        scanning = []
        pendingCommits = [:]
        branchLoading = []
        checkLogLoading = []
        saves.failAll()
    }
}

extension AppModel {
    func wireGitExtras(_ c: LpmClient) {
        c.onGitScanSecrets = { [weak self] in self?.gitExtras.applyScan($0) }
        c.onGitBranchFiles = { [weak self] in self?.gitExtras.applyBranchFiles($0) }
        c.onGitPrDiscussion = { [weak self] in self?.gitExtras.applyDiscussion($0) }
        c.onGitCheckLog = { [weak self] in self?.gitExtras.applyCheckLog($0) }
        c.onWriteFile = { [weak self] in self?.gitExtras.saves.deliver(reqId: $0.reqId, $0, error: nil) }
    }
}

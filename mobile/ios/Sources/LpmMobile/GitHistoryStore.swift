import Foundation

/// The History screens' state, reached as `model.gitHistory`: each project's
/// commits a page at a time, each opened commit's files, and each opened file's
/// patch. The client transport lives on `AppModel`; this store reaches it
/// through `model`.
@Observable @MainActor
final class GitHistoryStore {
    @ObservationIgnored weak var model: AppModel?
    private var client: LpmClient? { model?.client }

    /// The desktop's page size.
    static let pageSize = 100

    struct Log {
        var commits: [HistoryCommit] = []
        var hasMore = false
        var loading = false
        var loaded = false
        var error: String?
        /// Where the page in flight starts: 0 replaces the list, more appends.
        var asking = 0
    }

    /// A commit's files; nil `files` with no `error` is still loading.
    struct Files {
        var files: [CommitFile]?
        var error: String?
    }

    /// One file's patch in a commit, and its parse once it lands.
    struct Patch {
        var result: GitDiffResult?
        var parsed: ParsedDiff?
        var error: String?
    }

    struct CommitKey: Hashable {
        let project: String
        let hash: String
    }

    struct PatchKey: Hashable {
        let project: String
        let hash: String
        let path: String
    }

    private enum Pending: Hashable {
        case log(String)
        case files(CommitKey)
        case patch(PatchKey)
    }

    var logs: [String: Log] = [:]
    /// How each project's recent pushed commits did on CI, by full hash.
    var commitChecks: [String: [String: CiCheck.State]] = [:]
    var files: [CommitKey: Files] = [:]
    var patches: [PatchKey: Patch] = [:]

    @ObservationIgnored private let timeout = GenerationTimeout<Pending>()
    @ObservationIgnored private var asked: [PatchKey: CommitFile] = [:]

    private static let lateAnswer = "The Mac didn't answer in time."

    func log(_ project: String) -> Log { logs[project] ?? Log() }

    func checks(_ project: String) -> [String: CiCheck.State] { commitChecks[project] ?? [:] }

    func loadCommitChecks(_ project: String) {
        guard client?.hostFeatures.contains(LpmClient.gitCommitChecksFeature) == true else { return }
        client?.requestGitCommitChecks(project: project)
    }

    /// The newest page again; what's listed stays until it lands.
    func load(_ project: String) { request(project, skip: 0) }

    func loadMore(_ project: String) {
        let log = log(project)
        guard log.hasMore, !log.loading else { return }
        request(project, skip: log.commits.count)
    }

    /// Pull to refresh: ask again and hold the spinner until the answer lands.
    func refresh(_ project: String) async {
        load(project)
        for _ in 0..<100 {
            guard log(project).loading else { return }
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
    }

    private func request(_ project: String, skip: Int) {
        var log = log(project)
        log.loading = true
        log.asking = skip
        logs[project] = log
        client?.requestGitHistory(project: project, skip: skip, limit: Self.pageSize)
        if skip == 0 { loadCommitChecks(project) }
        timeout.arm(.log(project), seconds: 30) { [weak self] in
            guard let self, var log = self.logs[project], log.loading else { return }
            log.loading = false
            log.error = Self.lateAnswer
            self.logs[project] = log
        }
    }

    func applyHistory(_ project: String, skip: Int, page: HistoryPage?, error: String?) {
        timeout.cancel(.log(project))
        var log = log(project)
        log.loading = false
        log.loaded = true
        if let page {
            log.commits = skip == 0 ? page.commits : Array(log.commits.prefix(skip)) + page.commits
            log.hasMore = page.hasMore
            log.error = nil
        } else {
            log.error = error
        }
        logs[project] = log
    }

    // MARK: one commit

    func commitFiles(_ project: String, _ hash: String) -> Files {
        files[CommitKey(project: project, hash: hash)] ?? Files()
    }

    func loadFiles(_ project: String, hash: String) {
        let k = CommitKey(project: project, hash: hash)
        files[k] = Files()
        client?.requestGitCommitFiles(project: project, hash: hash)
        timeout.arm(.files(k), seconds: 30) { [weak self] in
            guard let self, self.files[k]?.files == nil else { return }
            self.files[k] = Files(error: Self.lateAnswer)
        }
    }

    func applyFiles(_ project: String, hash: String, files list: [CommitFile]?, error: String?) {
        let k = CommitKey(project: project, hash: hash)
        timeout.cancel(.files(k))
        files[k] = Files(files: list, error: list == nil ? error : nil)
    }

    // MARK: one file's patch

    func patch(_ project: String, _ hash: String, _ path: String) -> Patch {
        patches[PatchKey(project: project, hash: hash, path: path)] ?? Patch()
    }

    func loadPatch(_ project: String, hash: String, file: CommitFile) {
        let k = PatchKey(project: project, hash: hash, path: file.path)
        patches[k] = Patch()
        asked[k] = file
        client?.requestGitCommitPatch(project: project, hash: hash, path: file.path, oldPath: file.oldPath)
        timeout.arm(.patch(k), seconds: 30) { [weak self] in
            guard let self, let patch = self.patches[k], patch.result == nil, patch.error == nil else { return }
            self.patches[k] = Patch(error: Self.lateAnswer)
        }
    }

    func applyPatch(_ project: String, hash: String, path: String, result: GitDiffResult?, error: String?) {
        let k = PatchKey(project: project, hash: hash, path: path)
        timeout.cancel(.patch(k))
        asked[k] = nil
        guard let result else {
            patches[k] = Patch(error: error)
            return
        }
        patches[k] = Patch(result: result)
        let ext = (path as NSString).pathExtension
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let parsed = ParsedDiff(result.diff, ext: ext)
            DispatchQueue.main.async {
                guard let self, self.patches[k]?.result?.diff == result.diff else { return }
                self.patches[k]?.parsed = parsed
            }
        }
    }

    /// The link came back: ask again for whatever was still on its way.
    func handleConnectionReset() {
        for (project, log) in logs where log.loading {
            request(project, skip: log.asking)
        }
        for (k, entry) in files where entry.files == nil && entry.error == nil {
            loadFiles(k.project, hash: k.hash)
        }
        for (k, file) in asked {
            loadPatch(k.project, hash: k.hash, file: file)
        }
    }
}

extension AppModel {
    /// The Mac answers History, and the project is in a folder it can read.
    func canShowHistory(_ project: Project) -> Bool {
        client?.hostFeatures.contains(LpmClient.gitHistoryFeature) == true && !project.isRemote
    }

    func wireGitHistory(_ c: LpmClient) {
        c.onGitHistory = { [weak self] project, skip, page, error in
            self?.gitHistory.applyHistory(project, skip: skip, page: page, error: error)
        }
        c.onGitCommitChecks = { [weak self] project, states in
            self?.gitHistory.commitChecks[project] = states
        }
        c.onGitCommitFiles = { [weak self] project, hash, files, error in
            self?.gitHistory.applyFiles(project, hash: hash, files: files, error: error)
        }
        c.onGitCommitPatch = { [weak self] project, hash, path, result, error in
            self?.gitHistory.applyPatch(project, hash: hash, path: path, result: result, error: error)
        }
    }
}

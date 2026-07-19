import Foundation
import SwiftUI

/// The git-review state for every project, plus the operations that drive it.
/// Owned by `AppModel` and reached as `model.git`; split out so the ~40 review
/// properties observe and reset independently of the rest of the app. The client
/// transport still lives on `AppModel`; this store reaches it through `model`.
@Observable @MainActor
final class GitReviewStore {
    @ObservationIgnored weak var model: AppModel?
    private var client: LpmClient? { model?.client }

    // The last-loaded repository snapshot, and the load's error/in-flight state.
    var snapshots: [String: GitSnapshot] = [:]
    var loadError: [String: String] = [:]
    var loading: Set<String> = []
    // Long ops in flight, so each affordance can show its own spinner and
    // conflicting ops can be serialized.
    var pushing: Set<String> = []
    var committing: Set<String> = []
    var generatingMessage: Set<String> = []
    var generatingPr: Set<String> = []
    var creatingPr: Set<String> = []
    // Push/commit/generate-message failures surface on the review screen; PR
    // draft/create failures surface inside the PR sheet, kept separate so an open
    // sheet's error doesn't also fire the screen's alert.
    var opError: [String: String] = [:] {
        didSet {
            for (k, v) in opError where oldValue[k] != v { Haptics.error(); break }
        }
    }
    var prError: [String: String] = [:]
    // One-shot signals the view consumes then clears: a generated commit message,
    // a bumped counter on a successful commit, a drafted PR, a created PR's URL.
    var generatedMessage: [String: String] = [:]
    var commitTick: [String: Int] = [:]
    var prDraft: [String: GitPrDraft] = [:]
    var createdPrURL: [String: String] = [:]
    // Per-file diffs, keyed by diffKey(project, path).
    var diffs: [String: GitDiffResult] = [:]
    var diffLoading: Set<String> = []
    var diffError: [String: String] = [:]
    // Bumped when a background-built ParsedDiff lands in the cache, so views that
    // read parsedDiff() re-evaluate and swap their loading state for the diff.
    var parsedTick = 0
    // Files the user marked "viewed" on the review screen, keyed by project. Session
    // scoped: kept across snapshot refreshes, cleared on logout.
    var viewed: [String: Set<String>] = [:]
    // Git menu ops (Pull/Fetch/Discard) in flight; their failures also surface via
    // opError, presented on the project screen when the review screen is closed.
    var pulling: Set<String> = []
    var fetching: Set<String> = []
    var discarding: Set<String> = []
    // Switch-branch sheet state: the loaded branch list + current branch, load/
    // checkout errors (kept separate so they show inside the sheet), the branch
    // being checked out, and a tick the sheet observes to dismiss on success.
    var branches: [String: [GitBranch]] = [:]
    var currentBranch: [String: String] = [:]
    var branchesLoading: Set<String> = []
    var branchError: [String: String] = [:]
    var checkingOut: [String: String] = [:]
    var checkoutTick: [String: Int] = [:]
    // Projects with a new-branch creation in flight (from the switch-branch sheet).
    var creatingBranch: Set<String> = []

    // Parsed diffs (line classification + measured width), keyed by diffKey, so
    // scrolling the review list doesn't re-parse a file's diff on every body
    // evaluation. Invalidated when a fresh diff for that key arrives.
    @ObservationIgnored private var parsedDiffCache: [String: ParsedDiff] = [:]
    // Debounce per project for the git-changed push, so a burst of file writes
    // collapses into one refresh.
    @ObservationIgnored private var changedWork: [String: DispatchWorkItem] = [:]
    // The file stamp each loaded diff was fetched at, keyed by diffKey, so a
    // live refresh only re-fetches diffs whose file actually changed.
    @ObservationIgnored private var diffStamp: [String: String] = [:]
    // Per-project paths whose diffs are queued for the next coalesced `gitDiffs`
    // batch, plus the pending flush work item, so a burst of lazy per-file loads
    // (initial appear + reconcile) collapses into one round trip.
    @ObservationIgnored private var diffPending: [String: Set<String>] = [:]
    @ObservationIgnored private var diffFlush: [String: DispatchWorkItem] = [:]
    // Projects whose next snapshot arrival should reconcile loaded diffs against
    // the new stamps (set by a git-changed refresh, consumed in applySnapshot).
    @ObservationIgnored private var pendingWatchRefresh: Set<String> = []

    // A one-shot timeout per git op (keyed "op\u{0}project"), invalidated when its
    // reply lands so a late timeout can't clear a newer in-flight op.
    @ObservationIgnored private let timeout = GenerationTimeout<String>()

    func diffKey(_ project: String, _ path: String) -> String { project + "\n" + path }

    /// The parsed + highlighted diff for a file. Read-only: the value is built off
    /// the main thread when the diff arrives (see applyDiff) and cached; nil until
    /// that lands, so views keep showing their loading state.
    func parsedDiff(_ project: String, path: String) -> ParsedDiff? {
        parsedDiffCache[diffKey(project, path)]
    }

    /// Build ParsedDiff (parse + syntax highlight) off the main thread, then
    /// publish it into the cache — but only if the file's diff hasn't changed
    /// underneath us. The tick nudges observing views to re-read the cache.
    private func buildParsedDiff(key: String, diff: String, ext: String) {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let parsed = ParsedDiff(diff, ext: ext)
            DispatchQueue.main.async {
                guard let self, self.diffs[key]?.diff == diff else { return }
                self.parsedDiffCache[key] = parsed
                self.parsedTick &+= 1
            }
        }
    }

    /// Load the repository snapshot for the review screen. Coalesces concurrent
    /// loads; a timeout clears the spinner (and surfaces an error if nothing had
    /// loaded) so a dropped link can't spin forever.
    func load(_ project: String) {
        guard !loading.contains(project) else { return }
        loading.insert(project)
        loadError[project] = nil
        client?.requestGit(project: project)
        armTimeout("git", project, seconds: 25) { [weak self] in
            guard let self, self.loading.remove(project) != nil else { return }
            if self.snapshots[project] == nil {
                self.loadError[project] = "Couldn't reach your Mac. Pull to refresh."
            }
        }
    }

    /// Apply one file's diff reply (from a single `gitDiff` or a `gitDiffs` batch
    /// entry): clear its timeout + loading state, and — unless the diff is
    /// byte-identical to the already-parsed one — cache it and rebuild its parse
    /// off the main thread. The remembered stamp is always refreshed.
    func applyDiff(_ project: String, path: String, result: GitDiffResult?, error: String?) {
        let key = diffKey(project, path)
        clearTimeout("diff\n" + path, project)
        diffLoading.remove(key)
        if let result {
            // Identical diff already parsed: keep the existing parse, just
            // refresh the remembered stamp and drop the loading state.
            if !result.binary, diffs[key]?.diff == result.diff, parsedDiffCache[key] != nil {
                diffError[key] = nil
                recordDiffStamp(project, path: path, key: key)
                return
            }
            parsedDiffCache[key] = nil
            diffs[key] = result
            diffError[key] = nil
            recordDiffStamp(project, path: path, key: key)
            if !result.binary && !result.diff.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                buildParsedDiff(key: key, diff: result.diff, ext: (path as NSString).pathExtension)
            }
        } else {
            diffError[key] = error ?? "Couldn't load the diff."
        }
    }

    /// Lazily fetch one file's diff. The per-key loading/error/timeout state is
    /// still owned here (each file section shows its own state), but the network
    /// request is coalesced: the path joins a per-project pending set flushed as a
    /// single `gitDiffs` batch after a short delay, so the initial visible burst
    /// and each reconcile burst collapse into one round trip. A retry re-enters
    /// here and rides the same path as a one-element batch.
    func loadDiff(_ project: String, path: String) {
        let key = diffKey(project, path)
        guard !diffLoading.contains(key) else { return }
        diffLoading.insert(key)
        diffError[key] = nil
        enqueueDiff(project, path: path)
        armTimeout("diff\n" + path, project, seconds: 30) { [weak self] in
            guard let self, self.diffLoading.remove(key) != nil else { return }
            if self.diffs[key] == nil {
                self.diffError[key] = "Couldn't load the diff. Try again."
            }
        }
    }

    /// Add a path to the project's pending diff batch and (re)arm a ~50ms flush.
    private func enqueueDiff(_ project: String, path: String) {
        diffPending[project, default: []].insert(path)
        diffFlush[project]?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.flushDiffs(project) }
        diffFlush[project] = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05, execute: work)
    }

    /// Send one `gitDiffs` request for everything queued for a project.
    private func flushDiffs(_ project: String) {
        diffFlush[project] = nil
        guard let paths = diffPending.removeValue(forKey: project), !paths.isEmpty else { return }
        client?.requestGitDiffs(project: project, paths: Array(paths))
    }

    func commit(_ project: String, message: String, files: [String]) {
        guard !committing.contains(project) else { return }
        committing.insert(project)
        opError[project] = nil
        client?.gitCommit(project: project, message: message, files: files)
        armTimeout("commit", project, seconds: 120) { [weak self] in
            guard let self, self.committing.remove(project) != nil else { return }
            self.opError[project] = "Commit timed out. Check your Mac and try again."
        }
    }

    func push(_ project: String) {
        guard !pushing.contains(project) else { return }
        pushing.insert(project)
        opError[project] = nil
        client?.gitPush(project: project)
        armTimeout("push", project, seconds: 120) { [weak self] in
            guard let self, self.pushing.remove(project) != nil else { return }
            self.opError[project] = "Push timed out. Check your Mac and try again."
        }
    }

    func genMessage(_ project: String, files: [String]) {
        guard !generatingMessage.contains(project) else { return }
        generatingMessage.insert(project)
        opError[project] = nil
        client?.gitGenMessage(project: project, files: files)
        armTimeout("genMessage", project, seconds: 120) { [weak self] in
            guard let self, self.generatingMessage.remove(project) != nil else { return }
            self.opError[project] = "Message generation timed out. Try again."
        }
    }

    func genPr(_ project: String) {
        guard !generatingPr.contains(project) else { return }
        generatingPr.insert(project)
        prError[project] = nil
        client?.gitGenPr(project: project)
        armTimeout("genPr", project, seconds: 120) { [weak self] in
            guard let self, self.generatingPr.remove(project) != nil else { return }
            self.prError[project] = "Draft generation timed out. Try again."
        }
    }

    func createPr(_ project: String, title: String, body: String) {
        guard !creatingPr.contains(project) else { return }
        creatingPr.insert(project)
        prError[project] = nil
        client?.gitCreatePr(project: project, title: title, body: body)
        armTimeout("createPr", project, seconds: 120) { [weak self] in
            guard let self, self.creatingPr.remove(project) != nil else { return }
            self.prError[project] = "Pull request creation timed out. Try again."
        }
    }

    /// Ask the Mac to watch this project's working tree while the review screen is
    /// open, so file changes push `git-changed`. The client re-sends on reconnect.
    func watch(_ project: String) { client?.watchGit(project: project) }
    func unwatch(_ project: String) {
        changedWork[project]?.cancel()
        changedWork[project] = nil
        client?.unwatchGit(project: project)
    }

    /// A `git-changed` push (or a foreground return): reload the snapshot and
    /// re-fetch the diffs already loaded for this project, leaving selection,
    /// viewed, and collapse state untouched. Coalesced so a burst collapses to one.
    func changed(_ project: String) {
        changedWork[project]?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.refreshWatched(project) }
        changedWork[project] = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5, execute: work)
    }

    /// Reload the snapshot; the diff reconciliation (which needs the new stamps)
    /// runs in applySnapshot once that snapshot lands.
    func refreshWatched(_ project: String) {
        pendingWatchRefresh.insert(project)
        load(project)
    }

    /// After a watched snapshot arrives: re-fetch loaded diffs whose file stamp
    /// changed (or is unknown on either side), and drop diffs for files that left
    /// the snapshot. Untouched files keep their cached parse.
    private func reconcileWatchedDiffs(_ project: String) {
        guard let files = snapshots[project]?.files else { return }
        let stampByPath = Dictionary(files.map { ($0.path, $0.stamp) }, uniquingKeysWith: { a, _ in a })
        let prefix = project + "\n"
        for key in Array(diffs.keys) where key.hasPrefix(prefix) {
            let path = String(key.dropFirst(prefix.count))
            if let newStamp = stampByPath[path] {
                let remembered = diffStamp[key] ?? ""
                if newStamp.isEmpty || remembered.isEmpty || newStamp != remembered {
                    loadDiff(project, path: path)
                }
            } else {
                diffs[key] = nil
                parsedDiffCache[key] = nil
                diffStamp[key] = nil
                diffError[key] = nil
                diffLoading.remove(key)
            }
        }
    }

    private func recordDiffStamp(_ project: String, path: String, key: String) {
        diffStamp[key] = snapshots[project]?.files.first { $0.path == path }?.stamp ?? ""
    }

    func isViewed(_ project: String, path: String) -> Bool {
        viewed[project]?.contains(path) ?? false
    }
    func toggleViewed(_ project: String, path: String) {
        var set = viewed[project] ?? []
        if set.contains(path) { set.remove(path) } else { set.insert(path) }
        viewed[project] = set
    }

    func consumeGeneratedMessage(_ project: String) { generatedMessage[project] = nil }
    func consumePrDraft(_ project: String) { prDraft[project] = nil }
    func consumeCreatedPrURL(_ project: String) { createdPrURL[project] = nil }

    func pull(_ project: String) {
        guard !pulling.contains(project) else { return }
        pulling.insert(project)
        opError[project] = nil
        client?.gitPull(project: project)
        armTimeout("pull", project, seconds: 120) { [weak self] in
            guard let self, self.pulling.remove(project) != nil else { return }
            self.opError[project] = "Pull timed out. Check your Mac and try again."
        }
    }

    func fetch(_ project: String) {
        guard !fetching.contains(project) else { return }
        fetching.insert(project)
        opError[project] = nil
        client?.gitFetch(project: project)
        armTimeout("fetch", project, seconds: 120) { [weak self] in
            guard let self, self.fetching.remove(project) != nil else { return }
            self.opError[project] = "Fetch timed out. Check your Mac and try again."
        }
    }

    func discardAll(_ project: String) {
        guard !discarding.contains(project) else { return }
        discarding.insert(project)
        opError[project] = nil
        client?.gitDiscardAll(project: project)
        armTimeout("discard", project, seconds: 60) { [weak self] in
            guard let self, self.discarding.remove(project) != nil else { return }
            self.opError[project] = "Discarding changes timed out. Try again."
        }
    }

    func loadBranches(_ project: String) {
        guard !branchesLoading.contains(project) else { return }
        branchesLoading.insert(project)
        branchError[project] = nil
        client?.requestGitBranches(project: project)
        armTimeout("branches", project, seconds: 30) { [weak self] in
            guard let self, self.branchesLoading.remove(project) != nil else { return }
            if self.branches[project] == nil {
                self.branchError[project] = "Couldn't load branches. Try again."
            }
        }
    }

    func checkout(_ project: String, branch: String, remote: String) {
        guard checkingOut[project] == nil else { return }
        checkingOut[project] = branch
        branchError[project] = nil
        client?.gitCheckout(project: project, branch: branch, remote: remote)
        armTimeout("checkout", project, seconds: 60) { [weak self] in
            guard let self, self.checkingOut[project] != nil else { return }
            self.checkingOut[project] = nil
            self.branchError[project] = "Switching branch timed out. Try again."
        }
    }

    /// Create a new branch off HEAD and check it out. The switch-branch sheet
    /// dismisses on success (via checkoutTick) once the snapshot refreshes.
    func createBranch(_ project: String, name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !creatingBranch.contains(project) else { return }
        creatingBranch.insert(project)
        branchError[project] = nil
        client?.gitCreateBranch(project: project, name: trimmed)
        armTimeout("createBranch", project, seconds: 30) { [weak self] in
            guard let self, self.creatingBranch.remove(project) != nil else { return }
            self.branchError[project] = "Creating the branch timed out. Try again."
        }
    }

    // MARK: reply handlers (driven by AppModel.wireGit)

    func applySnapshot(_ project: String, _ snapshot: GitSnapshot?, error: String?) {
        clearTimeout("git", project)
        loading.remove(project)
        if let snapshot {
            snapshots[project] = snapshot
            loadError[project] = nil
            if pendingWatchRefresh.remove(project) != nil {
                reconcileWatchedDiffs(project)
            }
        } else {
            loadError[project] = error ?? "Couldn't read the repository."
        }
    }

    func finishCommit(_ project: String, error: String?) {
        clearTimeout("commit", project)
        committing.remove(project)
        if let error {
            opError[project] = error
        } else {
            Haptics.success()
            commitTick[project, default: 0] += 1
            load(project)
        }
    }

    func finishPush(_ project: String, error: String?) {
        clearTimeout("push", project)
        pushing.remove(project)
        if let error {
            opError[project] = error
        } else {
            Haptics.success()
            load(project)
        }
    }

    func finishGenMessage(_ project: String, message: String?, error: String?) {
        clearTimeout("genMessage", project)
        generatingMessage.remove(project)
        if let message {
            generatedMessage[project] = message
        } else if let error {
            opError[project] = error
        }
    }

    func finishGenPr(_ project: String, title: String?, body: String?, error: String?) {
        clearTimeout("genPr", project)
        generatingPr.remove(project)
        if let title, let body {
            prDraft[project] = GitPrDraft(title: title, body: body)
        } else if let error {
            prError[project] = error
        }
    }

    func finishCreatePr(_ project: String, url: String?, error: String?) {
        clearTimeout("createPr", project)
        creatingPr.remove(project)
        if let url {
            Haptics.success()
            createdPrURL[project] = url
            load(project)
        } else if let error {
            prError[project] = error
        }
    }

    func finishPull(_ project: String, error: String?) {
        clearTimeout("pull", project)
        pulling.remove(project)
        if let error { opError[project] = error } else { load(project) }
    }

    func finishFetch(_ project: String, error: String?) {
        clearTimeout("fetch", project)
        fetching.remove(project)
        if let error { opError[project] = error } else { load(project) }
    }

    func finishDiscard(_ project: String, error: String?) {
        clearTimeout("discard", project)
        discarding.remove(project)
        if let error { opError[project] = error } else { load(project) }
    }

    func applyBranches(_ project: String, current: String, branches: [GitBranch], error: String?) {
        clearTimeout("branches", project)
        branchesLoading.remove(project)
        if let error {
            branchError[project] = error
        } else {
            self.branches[project] = branches
            currentBranch[project] = current
            branchError[project] = nil
        }
    }

    func finishCheckout(_ project: String, error: String?) {
        clearTimeout("checkout", project)
        checkingOut[project] = nil
        if let error {
            branchError[project] = error
        } else {
            checkoutTick[project, default: 0] += 1
            load(project)
            client?.requestProjects()
            client?.requestSidebar()
        }
    }

    func finishCreateBranch(_ project: String, error: String?) {
        clearTimeout("createBranch", project)
        creatingBranch.remove(project)
        if let error {
            branchError[project] = error
        } else {
            // create_branch checks the new branch out, so mirror finishCheckout:
            // dismiss the sheet, refresh the snapshot + project list.
            Haptics.success()
            checkoutTick[project, default: 0] += 1
            load(project)
            client?.requestProjects()
            client?.requestSidebar()
        }
    }

    private func armTimeout(_ op: String, _ project: String, seconds: Double, _ fire: @escaping () -> Void) {
        timeout.arm(op + "\u{0}" + project, seconds: seconds, fire)
    }

    private func clearTimeout(_ op: String, _ project: String) {
        timeout.cancel(op + "\u{0}" + project)
    }
}

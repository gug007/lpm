import Foundation

/// The desktop's AI git shortcuts: commit with an AI-written message, the same
/// then push, and the full branch → commit → push → pull request chain.
enum GitAutoKind: String, CaseIterable, Identifiable {
    case commit
    case commitPush
    case pr

    var id: String { rawValue }

    var title: String {
        switch self {
        case .commit: "Auto Commit"
        case .commitPush: "Auto Commit and Push"
        case .pr: "Auto Create PR"
        }
    }

    var subtitle: String {
        switch self {
        case .commit: "AI writes the message, then commits"
        case .commitPush: "AI writes the message, commits, and pushes"
        case .pr: "AI names the branch, commits, pushes, and opens the PR"
        }
    }

    var stepIds: [String] {
        switch self {
        case .commit: ["commit"]
        case .commitPush: ["commit", "push"]
        case .pr: ["branch", "commit", "push", "pr"]
        }
    }
}

struct GitAutoStep: Equatable, Identifiable {
    enum Status: String {
        case pending, running, done, failed, skipped
    }

    let id: String
    let status: Status
    let detail: String

    var label: String {
        switch id {
        case "branch": "Create branch"
        case "commit": "Commit changes"
        case "push": "Push"
        case "pr": "Open pull request"
        default: id
        }
    }
}

/// One run as the Mac reports it. The Mac owns the run, so this is always the
/// whole state, never a delta; `runId` 0 is the phone's placeholder until the
/// Mac's first frame lands.
struct GitAutoRun: Equatable {
    enum Phase: String {
        case running, done, failed, canceled
    }

    var runId: Int
    var nonce: String
    var kind: GitAutoKind
    var phase: Phase
    var canceling: Bool
    var steps: [GitAutoStep]
    var error: String
    var message: String
    var rebased: Bool
    var url: String
    var title: String
    var branch: String
    var base: String

    var running: Bool { phase == .running }

    init?(_ o: [String: Any]) {
        guard let kind = GitAutoKind(rawValue: o["kind"] as? String ?? ""),
              let phase = Phase(rawValue: o["phase"] as? String ?? "") else { return nil }
        runId = o["runId"] as? Int ?? 0
        nonce = o["nonce"] as? String ?? ""
        self.kind = kind
        self.phase = phase
        canceling = o["canceling"] as? Bool ?? false
        steps = (o["steps"] as? [[String: Any]] ?? []).compactMap { s in
            guard let id = s["id"] as? String else { return nil }
            return GitAutoStep(id: id,
                               status: GitAutoStep.Status(rawValue: s["status"] as? String ?? "") ?? .pending,
                               detail: s["detail"] as? String ?? "")
        }
        error = o["error"] as? String ?? ""
        message = o["message"] as? String ?? ""
        rebased = o["rebased"] as? Bool ?? false
        url = o["url"] as? String ?? ""
        title = o["title"] as? String ?? ""
        branch = o["branch"] as? String ?? ""
        base = o["base"] as? String ?? ""
    }

    init(placeholder kind: GitAutoKind) {
        runId = 0
        nonce = UUID().uuidString
        self.kind = kind
        phase = .running
        canceling = false
        steps = kind.stepIds.map { GitAutoStep(id: $0, status: .pending, detail: "") }
        error = ""
        message = ""
        rebased = false
        url = ""
        title = ""
        branch = ""
        base = ""
    }
}

/// Auto Commit / Auto Commit and Push / Auto Create PR runs, per project.
/// Owned by `AppModel` and reached as `model.gitAuto`.
///
/// The Mac runs the whole chain and broadcasts every change, so a locked phone
/// loses nothing: after a reconnect it asks for the current state of any run
/// it still shows as running.
@Observable @MainActor
final class GitAutoStore {
    @ObservationIgnored weak var model: AppModel?
    private var client: LpmClient? { model?.client }

    var runs: [String: GitAutoRun] = [:]
    // "Switch to <base>" after a pull request lands: in flight, its failure, and
    // a tick the open sheet watches to dismiss.
    var switching: Set<String> = []
    var switchError: [String: String] = [:]
    var switchedTick: [String: Int] = [:]

    // Projects whose run sheet is on screen; a run that fails while its sheet is
    // closed surfaces through the project screen's git alert instead.
    @ObservationIgnored private var presented: Set<String> = []
    @ObservationIgnored private let timeout = GenerationTimeout<String>()

    func isRunning(_ project: String) -> Bool { runs[project]?.running ?? false }

    /// Start a run, or keep watching the one already going: the Mac allows one
    /// per project and answers a second start with the run in progress.
    func start(_ project: String, kind: GitAutoKind) {
        guard !isRunning(project) else { return }
        let placeholder = GitAutoRun(placeholder: kind)
        runs[project] = placeholder
        client?.gitAuto(project: project, kind: kind.rawValue, nonce: placeholder.nonce)
        timeout.arm(project, seconds: 20) { [weak self] in self?.verifyStarted(project) }
    }

    /// The start went unanswered. That can be a phone that slept through the
    /// reply, so ask the Mac what it has before giving up; a Mac too old to know
    /// either verb never answers at all.
    private func verifyStarted(_ project: String) {
        guard let run = runs[project], run.running, run.runId == 0 else { return }
        client?.gitAutoState(project: project)
        timeout.arm(project, seconds: 20) { [weak self] in
            guard let self, var run = self.runs[project], run.running, run.runId == 0 else { return }
            run.phase = .failed
            run.error = "Your Mac didn't respond. Make sure lpm on your Mac is up to date, then try again."
            self.finish(project, run, tracked: true)
        }
    }

    func cancel(_ project: String) {
        guard var run = runs[project], run.running, !run.canceling else { return }
        run.canceling = true
        runs[project] = run
        client?.gitAutoCancel(project: project)
    }

    func sheetAppeared(_ project: String) { presented.insert(project) }
    func sheetDisappeared(_ project: String) { presented.remove(project) }

    func apply(_ project: String, run: GitAutoRun?, error: String?) {
        let current = runs[project]
        let tracked = current?.running ?? false
        if let error {
            timeout.cancel(project)
            guard var failed = current, tracked else { return }
            failed.phase = .failed
            failed.error = error
            finish(project, failed, tracked: true)
            return
        }
        guard let run else {
            // The Mac holds no run: either the start never reached it, or the Mac
            // restarted mid-run. Either way nothing is coming.
            lose(project)
            return
        }
        if let current, tracked, current.runId == 0, !run.running, run.nonce != current.nonce {
            // Waiting on our own start, a finished run that isn't ours is the
            // project's previous one: the start never reached the Mac. (A running
            // one is fine: the Mac answers a start with the run already going.)
            lose(project)
            return
        }
        timeout.cancel(project)
        if let current, current.runId > run.runId { return }
        if run.running {
            runs[project] = run
        } else if tracked || current?.runId != run.runId {
            finish(project, run, tracked: tracked)
        } else {
            runs[project] = run
        }
    }

    private func lose(_ project: String) {
        guard var lost = runs[project], lost.running else { return }
        timeout.cancel(project)
        lost.phase = .failed
        lost.canceling = false
        lost.error = lost.runId == 0
            ? "Couldn't start on your Mac. Try again."
            : "Lost track of this run on your Mac. Check the project before trying again."
        finish(project, lost, tracked: true)
    }

    /// A run reached its end: record it, and refresh everything it may have
    /// changed (branch, files, ahead count, the project list's branch label).
    /// Feedback is for the phone that was following the run, not one that only
    /// heard its last frame.
    private func finish(_ project: String, _ run: GitAutoRun, tracked: Bool) {
        runs[project] = run
        if tracked {
            switch run.phase {
            case .done:
                Haptics.success()
            case .failed:
                if presented.contains(project) { Haptics.error() }
                else { model?.git.opError[project] = run.error }
            default:
                break
            }
        }
        model?.git.load(project)
        client?.requestProjects()
        client?.requestSidebar()
    }

    func switchToBase(_ project: String, base: String) {
        guard !base.isEmpty, !switching.contains(project) else { return }
        switching.insert(project)
        switchError[project] = nil
        client?.gitAutoSwitchBase(project: project, base: base)
        timeout.arm("switch\u{0}" + project, seconds: 120) { [weak self] in
            guard let self, self.switching.remove(project) != nil else { return }
            self.switchError[project] = "Switching branch timed out. Try again."
        }
    }

    func finishSwitch(_ project: String, base: String, error: String?, pullError: String?) {
        timeout.cancel("switch\u{0}" + project)
        switching.remove(project)
        if let error {
            switchError[project] = error
            return
        }
        if let pullError {
            model?.git.opError[project] = "Switched to \(base), but pull failed: \(pullError)"
        } else {
            Haptics.success()
        }
        switchedTick[project, default: 0] += 1
        model?.git.load(project)
        client?.requestProjects()
        client?.requestSidebar()
    }

    /// The socket was replaced: re-ask for every run still showing as running
    /// (queued until the link is back, behind any start still waiting to go),
    /// and drop the switch spinner, whose reply can't survive the reconnect.
    func handleConnectionReset() {
        for (project, run) in runs where run.running {
            client?.gitAutoState(project: project)
        }
        for project in switching {
            timeout.cancel("switch\u{0}" + project)
        }
        switching = []
    }
}

import Foundation

/// Where one open popup sheet stands. `page` counts the loads the web view must
/// make; an answer that keeps the same page counts `pushes` instead, and its new
/// values reach the page without a reload.
struct ActionPopupState: Equatable {
    enum Phase: Equatable {
        case loading
        /// `retry` is false when asking again can't help (a config problem, a
        /// format this app doesn't know).
        case failed(String, retry: Bool)
        case shown(ActionPopupContent)
    }

    var phase: Phase = .loading
    var page = 0
    var pushes = 0
    var inFlight = false
    /// The ask on its way was `fresh`: a stale answer to one that wasn't asks again.
    var askedFresh = false
    /// The answer on its way loads the page anew even when it's the same (Refresh).
    var reloadOnAnswer = false
    /// Why the last ask failed while a page stayed on show.
    var refreshFailure: String?

    var content: ActionPopupContent? {
        if case .shown(let content) = phase { return content }
        return nil
    }

    var canReload: Bool {
        if case .failed(_, retry: false) = phase { return false }
        return true
    }

    /// The amber line under the page: why it couldn't be refreshed, else why its
    /// data command failed.
    var note: String? {
        guard let content else { return nil }
        if let failure = refreshFailure ?? (content.refreshError.isEmpty ? nil : content.refreshError) {
            return "Couldn't refresh: \(failure)"
        }
        return content.dataError.isEmpty ? nil : "Data: \(content.dataError)"
    }

    /// Takes the Mac's answer. True when it was stale and a fresh one is due.
    mutating func apply(_ reply: ActionPopupReply) -> Bool {
        inFlight = false
        let reload = reloadOnAnswer
        reloadOnAnswer = false
        guard let content = reply.content else {
            if self.content != nil {
                refreshFailure = reply.error
            } else {
                phase = .failed(reply.error, retry: true)
            }
            return false
        }
        refreshFailure = nil
        guard let html = content.html, content.error.isEmpty else {
            phase = .failed(content.error.isEmpty ? ActionPopupCopy.couldNotOpen : content.error, retry: true)
            return false
        }
        guard content.format == ActionPopupInfo.html else {
            phase = .failed(ActionPopupCopy.newerApp, retry: false)
            return false
        }
        if !reload && self.content?.html == html {
            pushes += 1
        } else {
            page += 1
        }
        phase = .shown(content)
        return content.stale && !askedFresh
    }

    /// No answer came: a sheet still loading says so; a page on show stays.
    mutating func timeOut() {
        inFlight = false
        reloadOnAnswer = false
        if phase == .loading {
            phase = .failed(ActionPopupCopy.lateAnswer, retry: true)
        } else if content != nil {
            refreshFailure = ActionPopupCopy.lateAnswer
        }
    }
}

/// The action popups on screen, reached as `model.actionPopups`: each sheet asks
/// the Mac for its page as it opens and every `refresh` seconds while it stays open,
/// taking the last result at once and a fresh one after a stale one; Refresh asks
/// for a fresh one.
@Observable @MainActor
final class ActionPopupStore {
    @ObservationIgnored weak var model: AppModel?
    private var client: LpmClient? { model?.client }

    private(set) var states: [String: ActionPopupState] = [:]
    @ObservationIgnored private let timers = GenerationTimeout<String>()

    private static let timeout: TimeInterval = 20

    var available: Bool { client?.hostFeatures.contains(LpmClient.actionPopupFeature) == true }

    func state(project: String, action: String) -> ActionPopupState {
        states[Self.key(project, action)] ?? ActionPopupState()
    }

    /// The sheet opened: ask for the page, unless the config already says why
    /// there's none.
    func open(project: String, action: Action) {
        guard let info = action.popup else { return }
        let key = Self.key(project, action.name)
        if !info.problem.isEmpty {
            states[key] = ActionPopupState(phase: .failed(info.problem, retry: false))
        } else if info.format != ActionPopupInfo.html {
            states[key] = ActionPopupState(phase: .failed(ActionPopupCopy.newerApp, retry: false))
        } else {
            states[key] = ActionPopupState()
            request(key, project: project, action: action.name, fresh: false)
        }
    }

    /// Refresh and Retry: run the commands again and load the page anew. A page on
    /// show stays until the answer comes.
    func reload(project: String, action: String) {
        let key = Self.key(project, action)
        guard let state = states[key], state.canReload else { return }
        if state.content == nil { states[key]?.phase = .loading }
        request(key, project: project, action: action, fresh: true, reload: true)
    }

    /// The refresh interval passed while the page is on screen: the Mac's last
    /// result, and a fresh one after it when that was stale.
    func tick(project: String, action: String) {
        let key = Self.key(project, action)
        guard let state = states[key], state.content != nil, !state.inFlight else { return }
        request(key, project: project, action: action, fresh: false)
    }

    /// The page's web content stopped (it crashed or the system reclaimed it).
    func pageFailed(project: String, action: String) {
        let key = Self.key(project, action)
        guard states[key] != nil else { return }
        states[key]?.phase = .failed(ActionPopupCopy.stopped, retry: true)
    }

    func close(project: String, action: String) {
        let key = Self.key(project, action)
        states[key] = nil
        timers.cancel(key)
    }

    func apply(_ reply: ActionPopupReply) {
        let key = Self.key(reply.project, reply.action)
        guard states[key] != nil else { return }
        timers.cancel(key)
        if states[key]?.apply(reply) == true {
            request(key, project: reply.project, action: reply.action, fresh: true)
        }
    }

    private func request(_ key: String, project: String, action: String, fresh: Bool, reload: Bool = false) {
        states[key]?.inFlight = true
        states[key]?.askedFresh = fresh
        if reload { states[key]?.reloadOnAnswer = true }
        client?.requestActionPopup(project: project, action: action, fresh: fresh)
        timers.arm(key, seconds: Self.timeout) { [weak self] in
            self?.states[key]?.timeOut()
        }
    }

    private static func key(_ project: String, _ action: String) -> String { "\(project)\n\(action)" }
}

extension AppModel {
    func wireActionPopups(_ c: LpmClient) {
        c.onActionPopup = { [weak self] reply in self?.actionPopups.apply(reply) }
    }
}

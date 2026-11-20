import Foundation

/// Where one open popup sheet stands. `page` counts the loads the web view must
/// make; an answer from a newer run of the same page counts `pushes` instead, and
/// its values reach the page without a reload.
struct ActionPopupState {
    enum Phase {
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
            phase = .failed(content.error.isEmpty ? ActionPopupCopy.couldNotOpen(reply.view) : content.error,
                            retry: true)
            return false
        }
        if !reload && self.content?.html == html {
            if self.content?.updatedAt != content.updatedAt { pushes += 1 }
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
        if case .loading = phase {
            phase = .failed(ActionPopupCopy.lateAnswer, retry: true)
        } else if content != nil {
            refreshFailure = ActionPopupCopy.lateAnswer
        }
    }
}

/// The action popups and apps on screen, reached as `model.actionPopups`: each
/// asks the Mac for its page as it opens and every `refresh` seconds while it
/// stays open, taking the last result at once and a fresh one after a stale one;
/// Refresh asks for a fresh one. A popup and an app of the same action are kept
/// apart, as the Mac keeps their results apart.
@Observable @MainActor
final class ActionPopupStore {
    @ObservationIgnored weak var model: AppModel?
    private var client: LpmClient? { model?.client }

    private(set) var states: [String: ActionPopupState] = [:]
    @ObservationIgnored private let timers = GenerationTimeout<String>()

    private static let timeout: TimeInterval = 20

    var available: Bool { client?.hostFeatures.contains(LpmClient.actionPopupFeature) == true }
    var appsAvailable: Bool { client?.hostFeatures.contains(LpmClient.actionAppFeature) == true }

    /// Whether a tap on `action` opens its app rather than running it.
    func opensApp(_ action: Action) -> Bool { action.app != nil && appsAvailable }

    func state(project: String, action: String, view: ActionPageView = .popup) -> ActionPopupState {
        states[Self.key(view, project, action)] ?? ActionPopupState()
    }

    /// The sheet or screen opened: ask for the page, unless the config already
    /// says why there's none.
    func open(project: String, action: Action, view: ActionPageView = .popup) {
        let info: (format: String, problem: String)?
        switch view {
        case .popup: info = action.popup.map { ($0.format, $0.problem) }
        case .tab: info = action.app.map { ($0.format, $0.problem) }
        }
        guard let info else { return }
        let key = Self.key(view, project, action.name)
        if !info.problem.isEmpty {
            states[key] = ActionPopupState(phase: .failed(info.problem, retry: false))
        } else if info.format != ActionPopupInfo.html {
            states[key] = ActionPopupState(phase: .failed(ActionPopupCopy.newerApp(view), retry: false))
        } else {
            states[key] = ActionPopupState()
            request(key, view: view, project: project, action: action.name, fresh: false)
        }
    }

    /// Refresh and Retry: run the commands again and load the page anew. A page on
    /// show stays until the answer comes.
    func reload(project: String, action: String, view: ActionPageView = .popup) {
        let key = Self.key(view, project, action)
        guard let state = states[key], state.canReload else { return }
        if state.content == nil { states[key]?.phase = .loading }
        request(key, view: view, project: project, action: action, fresh: true, reload: true)
    }

    /// The refresh interval passed while the page is on screen: the Mac's last
    /// result, and a fresh one after it when that was stale.
    func tick(project: String, action: String, view: ActionPageView = .popup) {
        let key = Self.key(view, project, action)
        guard let state = states[key], state.content != nil, !state.inFlight else { return }
        request(key, view: view, project: project, action: action, fresh: false)
    }

    /// The page's web content stopped (it crashed or the system reclaimed it).
    func pageFailed(project: String, action: String, view: ActionPageView = .popup) {
        let key = Self.key(view, project, action)
        guard states[key] != nil else { return }
        states[key]?.phase = .failed(ActionPopupCopy.stopped(view), retry: true)
    }

    func close(project: String, action: String, view: ActionPageView = .popup) {
        let key = Self.key(view, project, action)
        states[key] = nil
        timers.cancel(key)
    }

    func apply(_ reply: ActionPopupReply) {
        let key = Self.key(reply.view, reply.project, reply.action)
        guard states[key] != nil else { return }
        timers.cancel(key)
        if states[key]?.apply(reply) == true {
            request(key, view: reply.view, project: reply.project, action: reply.action, fresh: true)
        }
    }

    private func request(_ key: String, view: ActionPageView, project: String, action: String,
                         fresh: Bool, reload: Bool = false) {
        states[key]?.inFlight = true
        states[key]?.askedFresh = fresh
        if reload { states[key]?.reloadOnAnswer = true }
        switch view {
        case .popup: client?.requestActionPopup(project: project, action: action, fresh: fresh)
        case .tab: client?.requestActionApp(project: project, action: action, fresh: fresh)
        }
        timers.arm(key, seconds: Self.timeout) { [weak self] in
            self?.states[key]?.timeOut()
        }
    }

    private static func key(_ view: ActionPageView, _ project: String, _ action: String) -> String {
        "\(view.rawValue)\n\(project)\n\(action)"
    }
}

extension AppModel {
    func wireActionPopups(_ c: LpmClient) {
        c.onActionPopup = { [weak self] reply in self?.actionPopups.apply(reply) }
    }
}

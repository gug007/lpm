import UserNotifications

/// An agent you aren't looking at starting to wait while lpm Link is on screen.
/// The Mac doesn't push to a phone showing the app, so the phone says so itself:
/// a banner over whatever is open, posted as a notification shown in the
/// foreground (the desktop's in-app toast). One per Waiting report, never for the
/// tab on screen, several at once collapsed into one, with the same levels,
/// Waiting switch and quiet hours a push would get. Reached as `model.headsUp`.
@MainActor
final class WaitingHeadsUp {
    weak var model: AppModel?

    /// Marks the notifications this posts, which the foreground presenter shows.
    nonisolated static let marker = "lpm.inApp"
    private static let identifier = "lpm.inapp.waiting"

    private struct Wait: Equatable {
        let project: String
        let projectLabel: String
        let terminalId: String
        let terminal: String
        let key: String
        let ts: Int
    }

    /// The terminal open on screen, which never gets a banner.
    var terminalOnScreen: String? {
        didSet {
            guard let terminalOnScreen, waits.contains(where: { $0.terminalId == terminalOnScreen }) else { return }
            waits.removeAll { $0.terminalId == terminalOnScreen }
            repost()
        }
    }

    /// The waits the banner stands for, oldest first.
    private var waits: [Wait] = []
    /// Waiting reports already told, so a refresh never tells one twice.
    private var told: Set<String> = []
    /// Projects whose status has loaded since the link came up: their first load
    /// only records what already waits, which the list shows anyway.
    private var known: Set<String> = []

    /// A project's status, as it was before this update.
    func statusChanged(_ project: Project, before: [StatusEntry]) {
        let firstLoad = known.insert(project.name).inserted
        let waiting = project.statusEntries.filter { $0.value == "Waiting" && !$0.paneID.isEmpty }
        let stillWaiting = Set(waiting.map(\.paneID))
        let gone = { (wait: Wait) in wait.project == project.name && !stillWaiting.contains(wait.terminalId) }
        let ended = waits.contains(where: gone)
        waits.removeAll(where: gone)
        let fresh = waiting.filter { told.insert(Self.report($0, project.name)).inserted }
        guard !firstLoad else { return }
        let announce = fresh.filter { entry in
            if entry.paneID == terminalOnScreen { return false }
            return !before.contains { old in
                old.key == entry.key && old.timestamp == entry.timestamp && old.value == "Waiting"
            }
        }
        guard !announce.isEmpty, allows(project) else {
            if ended { repost(sound: false) }
            return
        }
        let labels = model?.terminals[project.name] ?? []
        for entry in announce {
            waits.removeAll { $0.terminalId == entry.paneID }
            waits.append(Wait(project: project.name, projectLabel: project.label.isEmpty ? project.name : project.label,
                              terminalId: entry.paneID,
                              terminal: labels.first { $0.id == entry.paneID }?.label ?? "",
                              key: entry.key, ts: entry.timestamp))
        }
        repost(sound: true)
    }

    func handleConnectionReset() {
        known = []
        waits = []
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [Self.identifier])
    }

    private static func report(_ entry: StatusEntry, _ project: String) -> String {
        "\(project)\n\(entry.key)\n\(entry.timestamp)"
    }

    /// What a Waiting push for this project would get: the app on screen, the
    /// Waiting switch on, the project not turned off (a copy follows its
    /// original), and outside quiet hours.
    private func allows(_ project: Project) -> Bool {
        guard let model, model.inForeground, model.notifyEnabled, model.notifyWaiting else { return false }
        let levels = model.notifyProjectLevels
        let level = levels[project.name] ?? (project.isDuplicate ? levels[project.parentName] : nil)
        if level == ProjectNotifyLevel.off.rawValue { return false }
        return !QuietHours.load().quiets(status: "Waiting", at: Date())
    }

    private func repost(sound: Bool = false) {
        let center = UNUserNotificationCenter.current()
        guard let newest = waits.last else {
            center.removeDeliveredNotifications(withIdentifiers: [Self.identifier])
            return
        }
        let content = UNMutableNotificationContent()
        if waits.count == 1 {
            content.title = newest.projectLabel
            content.body = (newest.terminal.isEmpty ? "An agent" : newest.terminal) + " needs you"
        } else {
            content.title = "\(waits.count) agents need you"
            content.body = waits.reversed().map { wait in
                wait.terminal.isEmpty ? wait.projectLabel : "\(wait.projectLabel) · \(wait.terminal)"
            }.joined(separator: ", ")
        }
        content.threadIdentifier = Self.identifier
        if sound { content.sound = .default }
        // The same fields a push carries, so a tap opens the newest wait's tab and
        // the reconcile withdraws it once that wait moves on.
        var info: [AnyHashable: Any] = [
            Self.marker: true, "project": newest.project, "target": "terminal",
            "terminalId": newest.terminalId, "statusKey": newest.key, "status": "Waiting",
        ]
        if let serverId = model?.activeRecord?.serverId, !serverId.isEmpty { info["serverId"] = serverId }
        content.userInfo = info
        center.add(UNNotificationRequest(identifier: Self.identifier, content: content, trigger: nil))
    }
}

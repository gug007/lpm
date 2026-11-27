import UserNotifications

/// One answer from a notification button, for the agent and the exact status
/// report the notification was about — the Mac types it in only while that
/// report still stands.
struct AgentAnswer: Equatable {
    let serverId: String?
    let project: String
    let projectLabel: String
    let terminal: String
    let terminalId: String
    let key: String
    let ts: Int
    let action: AgentAnswerAction
    let text: String?
    /// For Allow: the dialog the notification showed and the choice it named,
    /// so the Mac presses Enter only while that choice is still highlighted.
    let dialog: String?
    let option: String?

    init?(response: UNNotificationResponse) {
        guard let action = AgentAnswerAction(identifier: response.actionIdentifier) else { return nil }
        let info = response.notification.request.content.userInfo
        let string = { (key: String) in info[key] as? String ?? "" }
        guard !string("project").isEmpty, !string("terminalId").isEmpty, !string("statusKey").isEmpty,
              let ts = info["ts"] as? Int else { return nil }
        let text = (response as? UNTextInputNotificationResponse)?.userText
        if action == .reply, text?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true { return nil }
        serverId = (info["serverId"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        project = string("project")
        projectLabel = string("projectLabel")
        terminal = string("terminal")
        terminalId = string("terminalId")
        key = string("statusKey")
        self.ts = ts
        self.action = action
        self.text = action == .reply ? text : nil
        let shown = AgentAlertDialog(userInfo: info)
        dialog = action == .allow ? shown?.id : nil
        option = action == .allow ? shown?.allowKey : nil
    }

    var title: String { projectLabel.isEmpty ? project : projectLabel }
}

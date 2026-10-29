import UserNotifications

/// Decrypts an lpm push payload and rewrites the notification with the real
/// project / terminal / status. The payload is sealed with the phone's shared push
/// key (AES-256-GCM, `nonce || ciphertext || tag` base64). On any failure we
/// deliver the untouched generic content, so a notification still shows and nothing
/// sensitive leaks.
final class NotificationService: UNNotificationServiceExtension {
    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var fallback: UNNotificationContent?

    override func didReceive(_ request: UNNotificationRequest,
                             withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        self.contentHandler = contentHandler
        self.fallback = request.content
        contentHandler(rewritten(request.content) ?? request.content)
    }

    override func serviceExtensionTimeWillExpire() {
        if let contentHandler, let fallback { contentHandler(fallback) }
    }

    private func rewritten(_ original: UNNotificationContent) -> UNNotificationContent? {
        guard let blob = original.userInfo["blob"] as? String,
              let payload = PushPayload.open(blob: blob),
              let mutable = original.mutableCopy() as? UNMutableNotificationContent
        else { return nil }
        if let target = payload["target"] as? String, target == "recap" || target == "usage" {
            return quieted(macNotice(payload, target: target, into: mutable), status: "")
        }
        guard let project = payload["project"] as? String, !project.isEmpty else { return nil }
        AgentWidgetStore.apply(push: payload)

        let terminal = payload["terminal"] as? String ?? ""
        let status = payload["status"] as? String ?? ""
        let statusKey = payload["key"] as? String ?? ""
        // The Mac names the project the way its sidebar does; `project` itself is
        // the file name (an id for a duplicate) and absent-label Macs predate it.
        let label = payload["projectLabel"] as? String ?? ""

        mutable.title = label.isEmpty ? project : label
        var line = body(terminal: terminal, status: status)
        if let changes = Self.changesText(payload["changes"] as? [String: Any]) {
            line += " · " + changes
        }
        // A finish carries the words the agent ended on, most often its question.
        if let summary = payload["summary"] as? String, !summary.isEmpty {
            mutable.subtitle = line
            mutable.body = summary
        } else {
            mutable.body = line
        }
        // Group notifications per project in Notification Center, and name the
        // project for a Focus filter that lets only some projects through.
        mutable.threadIdentifier = project
        mutable.filterCriteria = project
        var info = mutable.userInfo
        info["project"] = project
        for key in ["target", "terminalId", "automationId"] {
            if let value = payload[key] as? String, !value.isEmpty {
                info[key] = value
            }
        }
        // Carry the status entry key so a later background clear / foreground
        // reconcile can find and withdraw exactly this notification, and the status
        // it announced so one that has moved on is withdrawn too.
        info["statusKey"] = statusKey
        if !status.isEmpty {
            info["status"] = status
        }
        // Carry the sending Mac's id (absent on old Macs) so a clear/reconcile from
        // one Mac never withdraws a same-named project's notification from another.
        if let serverId = payload["serverId"] as? String, !serverId.isEmpty {
            info["serverId"] = serverId
        }
        // The answers the Mac takes back from here, and the report they answer:
        // it types one in only while that same report still stands.
        if let category = AgentAnswerAction.category(for: payload["actions"] as? [String] ?? []) {
            mutable.categoryIdentifier = category
            if let ts = payload["ts"] as? Int { info["ts"] = ts }
            info["projectLabel"] = label
            info["terminal"] = terminal
        }
        mutable.userInfo = info
        return quieted(mutable, status: status)
    }

    /// In quiet hours a notification goes to the list without a sound or banner.
    private func quieted(_ content: UNMutableNotificationContent?, status: String) -> UNNotificationContent? {
        guard let content else { return nil }
        if QuietHours.load().quiets(status: status, at: Date()) {
            content.interruptionLevel = .passive
            content.sound = nil
        }
        return content
    }

    /// "4 files, +143 −21": what the project's uncommitted changes come to.
    static func changesText(_ changes: [String: Any]?) -> String? {
        guard let changes, let files = changes["files"] as? Int, files > 0 else { return nil }
        let added = changes["added"] as? Int ?? 0
        let removed = changes["removed"] as? Int ?? 0
        return "\(files) \(files == 1 ? "file" : "files"), +\(added) −\(removed)"
    }

    /// The Mac's own news rather than a project's: Monday's weekly recap or a
    /// limit reminder. The Mac writes the words, and a tap opens `target` on that
    /// Mac (the recap of the week it names, or Usage).
    private func macNotice(_ payload: [String: Any], target: String, into mutable: UNMutableNotificationContent) -> UNMutableNotificationContent? {
        guard let title = payload["title"] as? String, !title.isEmpty else { return nil }
        mutable.title = title
        mutable.body = payload["body"] as? String ?? ""
        mutable.threadIdentifier = target
        var info = mutable.userInfo
        info["target"] = target
        for key in ["week", "serverId"] {
            if let value = payload[key] as? String, !value.isEmpty { info[key] = value }
        }
        mutable.userInfo = info
        return mutable
    }

    private func body(terminal: String, status: String) -> String {
        let phrase: String
        switch status {
        case "Waiting": phrase = "Agent is waiting for you"
        case "Done": phrase = "Agent finished"
        case "Error": phrase = "Agent hit an error"
        default: phrase = status
        }
        return terminal.isEmpty ? phrase : "\(terminal) — \(phrase)"
    }
}

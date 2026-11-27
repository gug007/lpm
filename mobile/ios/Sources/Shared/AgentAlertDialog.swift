import Foundation

/// What a permission prompt's notification says Allow approves (PROTOCOL.md, a
/// `Waiting` alert's `dialog`): the question the agent asks, the lines about it
/// (the command, the file) and the highlighted choice Enter picks. The service
/// extension writes the text and copies the id and key into `userInfo`; Allow
/// sends them back.
struct AgentAlertDialog: Equatable {
    let id: String
    let question: String
    let details: [String]
    let allow: String
    let allowKey: String

    init?(payload value: Any?) {
        guard let dialog = value as? [String: Any],
              let id = dialog["id"] as? String, !id.isEmpty,
              let allowKey = dialog["allowKey"] as? String, !allowKey.isEmpty
        else { return nil }
        self.id = id
        self.allowKey = allowKey
        question = dialog["question"] as? String ?? ""
        details = (dialog["details"] as? [String] ?? []).filter { !$0.isEmpty }
        allow = dialog["allow"] as? String ?? ""
    }

    init?(userInfo: [AnyHashable: Any]) {
        guard let id = userInfo[Key.id] as? String, !id.isEmpty,
              let allowKey = userInfo[Key.allowKey] as? String, !allowKey.isEmpty
        else { return nil }
        self.id = id
        self.allowKey = allowKey
        question = ""
        details = []
        allow = ""
    }

    func carry(into info: inout [AnyHashable: Any]) {
        info[Key.id] = id
        info[Key.allowKey] = allowKey
    }

    /// "Claude — Do you want to proceed?"
    func headline(terminal: String) -> String {
        let asked = question.isEmpty ? "Agent is waiting for you" : question
        return terminal.isEmpty ? asked : "\(terminal) — \(asked)"
    }

    /// The lines about what is asked, and what Allow picks when that isn't a
    /// plain "Yes".
    var body: String {
        var lines = details
        if !allow.isEmpty, allow.lowercased() != "yes" {
            lines.append("Allow picks “\(allow)”")
        }
        return lines.joined(separator: "\n")
    }

    private enum Key {
        static let id = "dialogId"
        static let allowKey = "dialogAllowKey"
    }
}

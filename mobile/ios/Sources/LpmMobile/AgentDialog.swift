import Foundation

/// One choice of a dialog an agent waits on, picked by typing its `key`.
struct AgentDialogOption: Identifiable, Equatable {
    let key: String
    let label: String
    let description: String
    /// Picking it opens a text box in the terminal instead of answering.
    let typed: Bool

    var id: String { key }
}

/// The choice an agent's CLI draws at the bottom of its terminal — a permission
/// prompt, a plan to approve, a question form — as the Mac read it off the
/// screen (PROTOCOL.md, Answering a dialog in the app).
struct AgentDialog: Equatable {
    /// Changes when the question or its choices do, not when the highlight moves.
    let id: String
    let question: String
    let details: [String]
    let options: [AgentDialogOption]
}

extension AgentDialog {
    init?(_ o: [String: Any]?) {
        guard let o, let id = o["id"] as? String, !id.isEmpty else { return nil }
        let options = (o["options"] as? [[String: Any]] ?? []).compactMap { opt -> AgentDialogOption? in
            guard let key = opt["key"] as? String, !key.isEmpty else { return nil }
            return AgentDialogOption(key: key, label: opt["label"] as? String ?? "",
                                     description: opt["description"] as? String ?? "",
                                     typed: opt["typed"] as? Bool ?? false)
        }
        guard options.count >= 2 else { return nil }
        self.id = id
        question = o["question"] as? String ?? ""
        details = o["details"] as? [String] ?? []
        self.options = options
    }
}

/// The Mac's answer to `agentDialog`: the report waiting on a terminal (its
/// status `key` and `ts`) and the dialog its screen shows, if any.
struct AgentDialogRead: Equatable {
    let project: String
    let terminalId: String
    let key: String
    let ts: Int
    let dialog: AgentDialog?

    init(_ o: [String: Any]) {
        project = o["project"] as? String ?? ""
        terminalId = o["terminalId"] as? String ?? ""
        key = o["key"] as? String ?? ""
        ts = o["ts"] as? Int ?? 0
        dialog = AgentDialog(o["dialog"] as? [String: Any])
    }
}

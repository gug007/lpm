import Foundation

/// Demo handlers for the dialog a waiting agent shows (`agentDialog`) and a pick
/// from it (`answerAgent` with `action: "pick"`). The storefront Claude tab ends
/// its sample run asking whether to update the cart badge; answered here, it
/// replies in the terminal as it does to a typed prompt.
extension DemoServer {
    private static let dialogTerminal = "demo-storefront-claude"

    private static let cartBadge = AgentDialog(
        id: "demo-cart-badge",
        question: "Update the cart badge to match the new checkout flow?",
        details: [],
        options: [
            AgentDialogOption(key: "1", label: "Yes, update it", description: "Show the step count in the badge",
                              typed: false),
            AgentDialogOption(key: "2", label: "Not now", description: "", typed: false),
            AgentDialogOption(key: "3", label: "Type something.", description: "", typed: true),
        ])

    func registerAgentDialogHandlers() {
        register("agentDialog") { [weak self] o in
            guard let self else { return }
            let project = o["project"] as? String ?? ""
            let terminal = o["terminalId"] as? String ?? ""
            var reply: [String: Any] = ["t": "agentDialog", "project": project, "terminalId": terminal,
                                        "dialog": NSNull()]
            if let waiting = self.waitingStatus(project: project, terminal: terminal) {
                reply["key"] = waiting.key
                reply["ts"] = waiting.timestamp
                if let dialog = self.demoDialog(terminal: terminal, key: waiting.key) {
                    reply["dialog"] = Self.json(dialog)
                }
            }
            self.push(reply)
        }
    }

    func answerDemoDialog(_ o: [String: Any]) {
        let project = o["project"] as? String ?? ""
        let terminal = o["terminalId"] as? String ?? ""
        let option = o["option"] as? String ?? ""
        var reply: [String: Any] = ["t": "answerAgent", "ok": true]
        reply["reqId"] = o["reqId"]
        let waiting = waitingStatus(project: project, terminal: terminal)
        let shown = waiting.flatMap { demoDialog(terminal: terminal, key: $0.key) }
        if waiting?.key != o["key"] as? String || waiting?.timestamp != o["ts"] as? Int || shown == nil {
            reply["ok"] = false
            reply["error"] = "This prompt was already answered."
        } else if shown?.id != o["dialog"] as? String {
            reply["ok"] = false
            reply["error"] = "The question changed. Check it again before answering."
        } else if !(shown?.options.contains { $0.key == option } ?? false) {
            reply["ok"] = false
            reply["error"] = "That choice isn't one the question offers."
        }
        pushAfter(0.3) { [weak self] in
            guard let self else { return nil }
            if reply["ok"] as? Bool == true {
                self.world.answeredDialogs.insert(terminal)
                let typed = shown?.options.first { $0.key == option }?.typed ?? false
                if !typed { self.claudeRespond(terminal) }
            }
            return reply
        }
    }

    private func waitingStatus(project: String, terminal: String) -> DemoWorld.Status? {
        guard let idx = world.projectIndex(project) else { return nil }
        return world.projects[idx].status.first { $0.paneID == terminal && $0.value == "Waiting" }
    }

    private func demoDialog(terminal: String, key: String) -> AgentDialog? {
        guard terminal == Self.dialogTerminal, key.hasPrefix("claude_code_"),
              !world.answeredDialogs.contains(terminal) else { return nil }
        return Self.cartBadge
    }

    private static func json(_ dialog: AgentDialog) -> [String: Any] {
        ["id": dialog.id, "question": dialog.question, "details": dialog.details,
         "options": dialog.options.map {
             ["key": $0.key, "label": $0.label, "description": $0.description, "typed": $0.typed] as [String: Any]
         }]
    }
}

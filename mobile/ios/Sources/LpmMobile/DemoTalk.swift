import Foundation

/// Demo answers for the Talk button: a plan read off the sentence's own words,
/// with no AI behind it, and a run that makes the copy and opens the agent's tab
/// the way `duplicate` and `newTerminal` do. Mirrored in the Android demo.
extension DemoServer {
    func registerTalkHandlers() {
        register("talkPlan") { [weak self] o in
            guard let self else { return }
            let text = (o["text"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let words = text.lowercased()
            var reply: [String: Any] = ["t": "talkPlan", "reqId": o["reqId"] ?? NSNull(), "ok": false,
                                        "unsupported": false]
            if text.isEmpty {
                reply["error"] = "Say or type what to do first."
            } else if words.contains("delete") {
                reply["unsupported"] = true
                reply["error"] = "A plan can only duplicate a project, start an agent and send it a prompt."
            } else {
                let place = words.contains("worktree") ? "worktree"
                    : words.contains("duplicate") || words.contains("copy") ? "copy" : "here"
                let agent = words.contains("codex") ? "codex" : words.contains("gemini") ? "gemini" : "claude"
                let project = self.world.projects.first { words.contains($0.name.lowercased()) }?.name ?? ""
                let originals = self.world.projects.filter { $0.parentName.isEmpty }.map(\.name)
                reply = ["t": "talkPlan", "reqId": o["reqId"] ?? NSNull(), "ok": true,
                         "plan": ["project": project, "where": place, "agent": agent, "prompt": text,
                                  "label": place == "here" ? "" : "talk"],
                         "candidates": project.isEmpty ? Array(originals.prefix(2)) : []]
            }
            self.pushAfter(1.2, reply)
        }
        register("talkRun") { [weak self] o in
            guard let self else { return }
            let plan = o["plan"] as? [String: Any] ?? [:]
            let project = plan["project"] as? String ?? ""
            let place = plan["where"] as? String ?? ""
            let tab: [String: Any] = [
                "agent": plan["agent"] as? String ?? "",
                "prompt": (plan["prompt"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
            ]
            var reply: [String: Any] = ["t": "talkRun", "reqId": o["reqId"] ?? NSNull()]
            if let refusal = self.talkRefusal(project: project, tab: tab) {
                reply["ok"] = false
                reply["error"] = refusal
                self.push(reply)
                return
            }
            reply["ok"] = true
            self.push(reply)
            guard place == "copy" || place == "worktree" else {
                self.openTalkTab(tab, project: project)
                return
            }
            let label = (plan["label"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) { [weak self] in
                guard let self else { return }
                let copy = self.duplicateName(of: project, label: label)
                self.createDuplicate(of: project, named: copy, label: label,
                                     excludeUncommitted: self.world.duplicateExcludeUncommitted,
                                     pullLatest: self.world.duplicatePullLatest, groupName: nil, runCmd: "")
                guard let index = self.world.projectIndex(copy) else { return }
                self.world.projects[index].worktree = place == "worktree"
                self.push(["t": "projects-changed"])
                self.openTalkTab(tab, project: copy)
            }
        }
    }

    /// Why the demo Mac won't run a plan, nil when it will.
    private func talkRefusal(project: String, tab: [String: Any]) -> String? {
        if world.project(named: project) == nil { return "That project isn't available." }
        if tab["prompt"] as? String == "" { return "There's no prompt to send." }
        let offered = Self.demoAgentOptions.contains { $0["id"] as? String == tab["agent"] as? String }
        return offered ? nil : "That agent isn't available on this Mac."
    }

    private func openTalkTab(_ tab: [String: Any], project: String) {
        demoOpenTab(tab, project: project)
        push(world.terminalsPayload(project))
    }
}

import Foundation

/// Demo handlers for seen and archived agents (`agentArchive`), with the Mac's
/// Keep finished agents until archived on: opening a finished agent marks it seen,
/// and it stays listed until it's archived.
extension DemoServer {
    func registerAgentArchiveHandlers() {
        register("clearStatus") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let pane = o["paneId"] as? String, let value = o["value"] as? String else { return }
            self.markSeen(project) { $0.paneID == pane && $0.value == value }
        }
        register("markStatusSeen") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let keys = o["keys"] as? [String] else { return }
            self.markSeen(project) { keys.contains($0.key) && Self.finished($0) }
        }
        register("markStatusUnread") { [weak self] o in
            guard let self, let project = o["project"] as? String, let keys = o["keys"] as? [String],
                  let idx = self.world.projectIndex(project) else { return }
            let unread = self.world.projects[idx].seen.filter { keys.contains($0.key) }
            guard !unread.isEmpty else { return }
            self.world.projects[idx].seen.removeAll { keys.contains($0.key) }
            self.world.projects[idx].status += unread.map { entry in
                var unread = entry
                unread.seenAt = 0
                return unread
            }
            self.push(["t": "status-changed", "project": project])
        }
        register("archiveStatus") { [weak self] o in
            guard let self, let project = o["project"] as? String, let keys = o["keys"] as? [String],
                  let idx = self.world.projectIndex(project) else { return }
            let before = self.world.projects[idx].status.count + self.world.projects[idx].seen.count
            self.world.projects[idx].status.removeAll { keys.contains($0.key) && Self.finished($0) }
            self.world.projects[idx].seen.removeAll { keys.contains($0.key) }
            guard self.world.projects[idx].status.count + self.world.projects[idx].seen.count != before else { return }
            self.push(["t": "status-changed", "project": project])
        }
    }

    /// Closing a tab drops the seen agent it held.
    func demoDropSeenAgents(project: String, pane: String) {
        guard let idx = world.projectIndex(project),
              world.projects[idx].seen.contains(where: { $0.paneID == pane }) else { return }
        world.projects[idx].seen.removeAll { $0.paneID == pane }
        push(["t": "status-changed", "project": project])
    }

    private func markSeen(_ project: String, where matches: (DemoWorld.Status) -> Bool) {
        guard let idx = world.projectIndex(project) else { return }
        let now = Int(Date().timeIntervalSince1970 * 1000)
        let moving = world.projects[idx].status.filter(matches)
        guard !moving.isEmpty else { return }
        world.projects[idx].status.removeAll(where: matches)
        world.projects[idx].seen += moving.map { entry in
            var seen = entry
            seen.seenAt = now
            return seen
        }
        push(["t": "status-changed", "project": project])
    }

    private static func finished(_ entry: DemoWorld.Status) -> Bool {
        entry.value == "Done" || entry.value == "Error"
    }
}

extension DemoWorld {
    /// Agents opened earlier and kept, muted, under their projects: two finished
    /// turns in mobile-app and a problem in design-system, each in a tab of its own.
    mutating func seedSeenAgents(nowMs: Int) {
        let minute = 60_000
        func tab(_ project: String, _ cli: String, _ label: String, prompt: String, reply: String) -> Terminal {
            var term = Terminal(id: "demo-\(project)-\(cli)", label: label, project: project, cli: cli,
                                buffer: "\u{1B}[1m>\u{1B}[0m \(prompt)\r\n\r\n"
                                    + "\u{1B}[38;5;153m⏺\u{1B}[0m \(reply)\r\n\r\n\u{1B}[1m>\u{1B}[0m ")
            term.scriptStarted = true
            term.scriptFinished = true
            return term
        }
        func seen(_ key: String, _ value: String, pane: String, endedAgo: Int, took: Int,
                  seenAgo: Int) -> Status {
            let ended = nowMs - endedAgo
            return Status(key: key, value: value, priority: value == "Error" ? 40 : 20, timestamp: ended,
                          paneID: pane, turnStart: ended - took, endedAt: ended, seenAt: nowMs - seenAgo)
        }
        terminals["mobile-app"] = [
            tab("mobile-app", "claude", "Dark mode for settings", prompt: "Add dark mode to the settings screen",
                reply: "Settings now follows the system appearance, with its own override."),
            tab("mobile-app", "codex", "Remove unused deps", prompt: "Remove dependencies nothing imports",
                reply: "Removed 4 unused packages from package.json."),
        ]
        terminals["design-system"] = [
            tab("design-system", "claude", "Fix flaky snapshot test", prompt: "Fix the flaky Button snapshot test",
                reply: "The snapshot still differs on CI: fonts render differently there."),
        ]
        if let idx = projectIndex("mobile-app") {
            projects[idx].seen = [
                seen("claude_code_demo-mobile-app-claude", "Done", pane: "demo-mobile-app-claude",
                     endedAgo: 9 * minute, took: 12 * minute + 11_000, seenAgo: 4 * minute),
                seen("codex_demo-mobile-app-codex", "Done", pane: "demo-mobile-app-codex",
                     endedAgo: 41 * minute, took: 95_000, seenAgo: 33 * minute),
            ]
        }
        if let idx = projectIndex("design-system") {
            projects[idx].seen = [
                seen("claude_code_demo-design-system-claude", "Error", pane: "demo-design-system-claude",
                     endedAgo: 65 * minute, took: 6 * minute + 5_000, seenAgo: 58 * minute),
            ]
        }
    }
}

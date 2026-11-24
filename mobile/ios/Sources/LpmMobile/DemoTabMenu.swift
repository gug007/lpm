import Foundation

/// Demo handlers for the tab menu's fork / fork into copy / conversation title /
/// close others, answered as the Mac answers them: an ack, then the tabs again.
extension DemoServer {
    func registerTabMenuHandlers() {
        register("forkTerminal") { [weak self] o in
            guard let self, let project = o["project"] as? String, let id = o["id"] as? String else { return }
            self.push(["t": "forkTerminal", "ok": true])
            guard let source = self.forkableTerminal(project, id: id) else { return }
            self.world.terminals[project, default: []].append(self.fork(of: source, in: project))
            self.push(self.world.terminalsPayload(project))
        }
        // A copy of the project, made the way Duplicate makes one, with the
        // conversation carried on in a tab there.
        register("forkTerminalCopy") { [weak self] o in
            guard let self, let project = o["project"] as? String, let id = o["id"] as? String else { return }
            self.push(["t": "forkTerminalCopy", "ok": true])
            guard let source = self.forkableTerminal(project, id: id) else { return }
            let copyName = self.uniqueProjectName(project)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) { [weak self] in
                guard let self else { return }
                self.createDuplicate(of: project, named: copyName, label: "", excludeUncommitted: false,
                                     pullLatest: false, groupName: nil, runCmd: "")
                self.world.terminals[copyName, default: []].append(self.fork(of: source, in: copyName))
                self.push(["t": "projects-changed"])
            }
        }
        // The tab goes to the other project as it is, still running.
        register("moveTerminal") { [weak self] o in
            guard let self, let project = o["project"] as? String, let id = o["id"] as? String,
                  let to = o["to"] as? String, self.world.projects.contains(where: { $0.name == to }) else { return }
            self.push(["t": "moveTerminal", "ok": true])
            guard let index = self.world.terminals[project]?.firstIndex(where: { $0.id == id }),
                  var tab = self.world.terminals[project]?.remove(at: index) else { return }
            tab.project = to
            self.world.terminals[to, default: []].append(tab)
            self.push(self.world.terminalsPayload(project))
            self.push(self.world.terminalsPayload(to))
        }
        register("titleTerminal") { [weak self] o in
            guard let self, let project = o["project"] as? String, let id = o["id"] as? String else { return }
            self.push(["t": "titleTerminal", "ok": true])
            guard let index = self.world.terminals[project]?.firstIndex(where: { $0.id == id && $0.cli == "claude" })
            else { return }
            self.world.terminals[project]?[index].label = DemoWorld.conversationTitle
            self.push(self.world.terminalsPayload(project))
        }
        // The conversation carries on in the same tab under a new id, covered
        // while it moves, as the Mac moves it.
        register("switchTerminalAccount") { [weak self] o in
            guard let self, let project = o["project"] as? String, let id = o["id"] as? String,
                  let account = o["account"] as? String else { return }
            self.push(["t": "switchTerminalAccount", "ok": true])
            guard let index = self.world.terminals[project]?.firstIndex(where: { $0.id == id }),
                  let old = self.world.terminals[project]?[index], old.cli == "claude",
                  let name = self.world.claude.accounts.first(where: { $0.id == account && $0.signedIn })
                      .map({ $0.id == claudeMainLogin ? "Main login" : $0.label })
            else { return }
            var moved = old
            moved.tabKey = old.tabKey ?? old.id
            moved.id = self.nextTerminalId(project).id
            moved.subscribed = false
            moved.claudeAccount = account
            moved.switchingTo = name
            moved.switchedFrom = id
            moved.limitStop = nil
            self.world.terminals[project]?[index] = moved
            self.push(self.world.terminalsPayload(project))
            if let p = self.world.projectIndex(project), self.world.projects[p].status.contains(where: { $0.paneID == id }) {
                for s in self.world.projects[p].status.indices where self.world.projects[p].status[s].paneID == id {
                    self.world.projects[p].status[s].paneID = moved.id
                }
                self.push(["t": "status-changed", "project": project])
            }
            self.pushAfter(1.2) { [weak self] in
                guard let self, let i = self.world.terminals[project]?.firstIndex(where: { $0.id == moved.id })
                else { return nil }
                self.world.terminals[project]?[i].switchingTo = nil
                self.world.terminals[project]?[i].switchedFrom = nil
                return self.world.terminalsPayload(project)
            }
        }
        // The limit bar put away, as its × does on the Mac.
        register("dismissLimitStop") { [weak self] o in
            guard let self, let project = o["project"] as? String, let id = o["id"] as? String else { return }
            self.push(["t": "dismissLimitStop", "ok": true])
            guard let index = self.world.terminals[project]?.firstIndex(where: { $0.id == id }),
                  self.world.terminals[project]?[index].limitStop != nil else { return }
            self.world.terminals[project]?[index].limitStop = nil
            self.push(self.world.terminalsPayload(project))
        }
        register("closeOtherTerminals") { [weak self] o in
            guard let self, let project = o["project"] as? String, let id = o["id"] as? String else { return }
            self.push(["t": "closeOtherTerminals", "ok": true])
            guard let list = self.world.terminals[project], let kept = list.first(where: { $0.id == id }) else { return }
            let closing = list.filter { $0.id != id && !$0.pinned }
            guard !closing.isEmpty else { return }
            if o["whenDone"] as? Bool == true {
                for t in closing {
                    if self.demoBusy(project, t.id) { self.updateTerminal(t.id) { $0.closesWhenDone = true } }
                    else { self.demoCloseTerminal(project, t.id) }
                }
                self.push(self.world.terminalsPayload(project))
                return
            }
            let closed = Set(closing.map(\.id))
            self.world.terminals[project] = list.filter { !closed.contains($0.id) }
            closed.forEach { self.world.composerDrafts[$0] = nil }
            if kept.cli != "claude" && closing.contains(where: { $0.cli == "claude" }) {
                self.demoSetAgentStatus(project: project, entries: [])
            }
            self.push(self.world.terminalsPayload(project))
        }
        register("keepTerminal") { [weak self] o in
            guard let self, let project = o["project"] as? String, let id = o["id"] as? String else { return }
            self.updateTerminal(id) { $0.closesWhenDone = false }
            self.push(["t": "keepTerminal", "ok": true])
            self.push(self.world.terminalsPayload(project))
        }
    }

    func demoBusy(_ project: String, _ id: String) -> Bool {
        world.project(named: project)?.status.contains {
            $0.paneID == id && AgentState.of($0.value).isBusy
        } ?? false
    }

    func demoCloseTerminal(_ project: String, _ id: String) {
        let wasAgent = demoTerminal(id)?.cli == "claude"
        world.terminals[project]?.removeAll { $0.id == id }
        world.composerDrafts[id] = nil
        demoDropSeenAgents(project: project, pane: id)
        if wasAgent { demoSetAgentStatus(project: project, entries: []) }
    }

    /// The tabs that wait for their agent close a moment after it is done.
    func demoCloseFinished(_ project: String) {
        for t in world.terminals[project] ?? [] where t.closesWhenDone && !demoBusy(project, t.id) {
            pushAfter(3) { [weak self] in
                guard let self, self.demoTerminal(t.id)?.closesWhenDone == true, !self.demoBusy(project, t.id)
                else { return nil }
                self.demoCloseTerminal(project, t.id)
                return self.world.terminalsPayload(project)
            }
        }
    }

    private func forkableTerminal(_ project: String, id: String) -> DemoWorld.Terminal? {
        world.terminals[project]?.first { $0.id == id && $0.cli == "claude" }
    }

    /// A new tab carrying on `source`'s conversation: what it has said so far, and
    /// no scripted session of its own to play again.
    private func fork(of source: DemoWorld.Terminal, in project: String) -> DemoWorld.Terminal {
        var fork = DemoWorld.Terminal(id: nextTerminalId(project).id, label: source.label, project: project,
                                      emoji: source.emoji, cli: source.cli, buffer: source.buffer)
        fork.scriptStarted = true
        fork.scriptFinished = true
        return fork
    }
}

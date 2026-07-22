import Foundation

/// Demo handlers for the project list, sidebar, status, lifecycle (start/stop/
/// services), duplicate, add/remove, actions, and file reads. Also owns the
/// cross-domain hooks `demoAddProject` and `demoSetAgentStatus`, called by other
/// domains.
extension DemoServer {
    func registerProjectsHandlers() {
        register("projects") { [weak self] _ in
            guard let self else { return }
            self.push(self.world.projectsPayload())
        }
        register("sidebar") { [weak self] _ in
            guard let self else { return }
            self.push(self.world.sidebarPayload())
        }
        register("status") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            self.push(self.world.statusPayload(project))
        }
        register("duplicateDefaults") { [weak self] _ in
            guard let self else { return }
            self.push([
                "t": "duplicateDefaults",
                "excludeUncommitted": self.world.duplicateExcludeUncommitted,
                "reinstallDeps": self.world.duplicateReinstallDeps,
                "pullLatest": self.world.duplicatePullLatest,
            ])
        }

        registerLifecycleHandlers()
        registerServiceHandlers()
        registerProjectMutationHandlers()
        registerCreationHandlers()
        registerSidebarHandlers()
        registerActionHandlers()
    }

    // MARK: lifecycle

    private func registerLifecycleHandlers() {
        register("start") { [weak self] o in
            guard let self, let name = o["name"] as? String,
                  self.world.projectIndex(name) != nil else { return }
            let profile = o["profile"] as? String ?? ""
            self.pushAfter(0.8) { [weak self] in
                guard let self, let idx = self.world.projectIndex(name) else { return nil }
                self.world.projects[idx].running = true
                self.world.projects[idx].activeProfile =
                    self.world.projects[idx].profiles.contains(where: { $0.name == profile }) ? profile : ""
                if let first = self.startTargets(idx, profile: profile).first {
                    self.world.projects[idx].services[first].running = true
                }
                return ["t": "projects-changed"]
            }
            self.pushAfter(1.6) { [weak self] in
                guard let self, let idx = self.world.projectIndex(name),
                      self.world.projects[idx].running else { return nil }
                for si in self.startTargets(idx, profile: profile) {
                    self.world.projects[idx].services[si].running = true
                }
                self.push(["t": "status-changed", "project": name])
                return ["t": "projects-changed"]
            }
        }
        register("stop") { [weak self] o in
            guard let self, let name = o["name"] as? String,
                  self.world.projectIndex(name) != nil else { return }
            self.pushAfter(0.9) { [weak self] in
                guard let self, let idx = self.world.projectIndex(name) else { return nil }
                self.world.projects[idx].running = false
                self.world.projects[idx].activeProfile = ""
                for si in self.world.projects[idx].services.indices {
                    self.world.projects[idx].services[si].running = false
                }
                self.push(["t": "status-changed", "project": name])
                return ["t": "projects-changed"]
            }
        }
        register("toggleService") { [weak self] o in
            guard let self, let name = o["name"] as? String,
                  let service = o["service"] as? String else { return }
            self.pushAfter(0.9) { [weak self] in
                guard let self, let idx = self.world.projectIndex(name),
                      let si = self.world.projects[idx].services.firstIndex(where: { $0.name == service })
                else { return nil }
                self.world.projects[idx].services[si].running.toggle()
                self.world.projects[idx].running =
                    self.world.projects[idx].services.contains(where: { $0.running })
                return ["t": "projects-changed"]
            }
        }
    }

    private func startTargets(_ idx: Int, profile: String) -> [Int] {
        let p = world.projects[idx]
        if !profile.isEmpty, let prof = p.profiles.first(where: { $0.name == profile }) {
            return p.services.indices.filter { prof.services.contains(p.services[$0].name) }
        }
        return Array(p.services.indices)
    }

    // MARK: services, logs & files

    private func registerServiceHandlers() {
        register("services") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            guard let p = self.world.project(named: project) else {
                self.push(["t": "services", "project": project, "ok": false,
                           "error": "That project isn't available."])
                return
            }
            var services: [[String: Any]] = []
            var pane = 0
            for s in p.services {
                let live = p.running && s.running
                var d: [String: Any] = ["name": s.name, "running": live,
                                        "cmd": s.cmd, "port": s.port]
                if live { d["paneIndex"] = pane; pane += 1 }
                services.append(d)
            }
            self.push(["t": "services", "project": project, "ok": true,
                       "running": p.running, "services": services])
        }
        register("serviceLogs") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            let pane = o["paneIndex"] as? Int ?? 0
            let running = (self.world.project(named: project)?.running ?? false)
                ? (self.world.project(named: project)?.services.filter { $0.running } ?? [])
                : []
            guard running.indices.contains(pane) else {
                self.push(["t": "serviceLogs", "project": project, "paneIndex": pane,
                           "ok": false, "error": "That service isn't running."])
                return
            }
            let key = project + "\n" + running[pane].name
            let ticks = self.world.serviceLogTicks[key] ?? 0
            self.world.serviceLogTicks[key] = ticks + 1
            self.push(["t": "serviceLogs", "project": project, "paneIndex": pane, "ok": true,
                       "text": self.serviceLogText(svc: running[pane], ticks: ticks)])
        }
        register("readFile") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let path = o["path"] as? String else { return }
            self.push(["t": "file", "project": project, "path": path, "ok": true,
                       "content": self.demoFileContent(project: project, path: path),
                       "truncated": false])
        }
    }

    // MARK: rename / remove / duplicate

    private func registerProjectMutationHandlers() {
        register("renameProject") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            if let idx = self.world.projectIndex(project) {
                let label = (o["name"] as? String ?? "")
                self.world.projects[idx].label = label.isEmpty ? project : label
            }
            self.push(["t": "renameProject", "project": project, "ok": true])
            self.pushAfter(0.1) { ["t": "projects-changed"] }
        }
        register("remove") { [weak self] o in
            guard let self, let name = o["name"] as? String else { return }
            guard !self.world.projects.contains(where: { $0.parentName == name }) else {
                self.push(["t": "remove", "ok": false,
                           "error": "Remove this project's duplicates first."])
                return
            }
            self.world.projects.removeAll { $0.name == name }
            self.world.terminals[name] = nil
            self.world.backgroundRuns.removeAll { $0.project == name }
            self.world.sidebarOrder.removeAll { $0 == name }
            for i in self.world.folders.indices {
                self.world.folders[i].members.removeAll { $0 == name }
            }
            self.push(["t": "remove", "ok": true])
            self.pushAfter(0.1) { ["t": "projects-changed"] }
        }
        register("duplicate") { [weak self] o in
            guard let self, let name = o["name"] as? String else { return }
            guard let source = self.world.project(named: name) else {
                self.push(["t": "duplicate", "ok": false,
                           "error": "That project isn't available."])
                return
            }
            let count = min(50, max(1, o["count"] as? Int ?? 1))
            let labels = o["labels"] as? [String] ?? []
            let groupName = (o["groupName"] as? String).flatMap { $0.isEmpty ? nil : $0 }
            let excludeUncommitted = o["excludeUncommitted"] as? Bool ?? false
            let pullLatest = o["pullLatest"] as? Bool ?? true
            self.world.duplicateExcludeUncommitted = excludeUncommitted
            self.world.duplicateReinstallDeps = o["reinstallDeps"] as? Bool ?? false
            self.world.duplicatePullLatest = pullLatest

            var runCmd = ""
            switch o["runMode"] as? String ?? "none" {
            case "action":
                if let actionName = o["action"] as? String,
                   let action = self.findAction(actionName, in: source.actions) {
                    runCmd = action["cmd"] as? String ?? ""
                }
            case "command":
                runCmd = (o["command"] as? String ?? "")
                    .trimmingCharacters(in: .whitespacesAndNewlines)
            default:
                break
            }

            // Names are planned up front (so blank labels uniquify against each
            // other), but each copy lands at its progress tick so the list streams.
            var reserved = Set<String>()
            var plans: [(name: String, label: String)] = []
            for i in 0..<count {
                let label = (labels.indices.contains(i) ? labels[i] : "")
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                let copyName = self.uniqueProjectName(label.isEmpty ? name : label,
                                                      reserved: reserved)
                reserved.insert(copyName)
                plans.append((copyName, label))
            }
            for (i, plan) in plans.enumerated() {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.7 * Double(i + 1)) { [weak self] in
                    guard let self else { return }
                    self.createDuplicate(of: name, named: plan.name, label: plan.label,
                                         excludeUncommitted: excludeUncommitted,
                                         pullLatest: pullLatest, groupName: groupName,
                                         runCmd: runCmd)
                    self.push(["t": "duplicateProgress", "done": i + 1, "total": count,
                               "name": plan.name])
                    self.push(["t": "projects-changed"])
                }
            }
            self.pushAfter(0.7 * Double(count) + 0.5) {
                ["t": "duplicate", "ok": true, "name": plans.first?.name ?? name,
                 "names": plans.map(\.name)]
            }
        }
    }

    private func createDuplicate(of source: String, named copyName: String, label: String,
                                 excludeUncommitted: Bool, pullLatest: Bool,
                                 groupName: String?, runCmd: String) {
        guard world.project(named: source) != nil else { return }
        demoAddProject(name: copyName, copyOf: source)
        if !label.isEmpty, let idx = world.projectIndex(copyName) {
            world.projects[idx].label = label
        }
        if excludeUncommitted { world.git[copyName]?.files = [] }
        if pullLatest { world.git[copyName]?.behind = 0 }
        if let groupName { moveProjectToFolder(copyName, folder: groupName) }
        guard !runCmd.isEmpty else { return }
        ensureShellTerminal(copyName)
        demoWriteToShell(project: copyName, text: runCmd + "\r\n")
        writeToShellAfter(1.2, project: copyName,
                          text: commandOutput(cmd: runCmd, project: copyName))
    }

    // MARK: add / import / clone / discovery

    private func registerCreationHandlers() {
        register("createProject") { [weak self] o in
            guard let self, let name = o["name"] as? String else { return }
            guard !name.isEmpty else {
                self.push(["t": "createProject", "ok": false, "name": name,
                           "error": "Give this project a name."])
                return
            }
            guard self.world.projectIndex(name) == nil else {
                self.push(["t": "createProject", "ok": false, "name": name,
                           "error": "A project named “\(name)” already exists."])
                return
            }
            self.demoAddProject(name: name, copyOf: nil)
            self.push(["t": "createProject", "ok": true, "name": name])
            self.pushAfter(0.1) { ["t": "projects-changed"] }
        }
        register("createSshProject") { [weak self] o in
            guard let self, let name = o["name"] as? String else { return }
            let ssh = o["ssh"] as? [String: Any] ?? [:]
            let host = ssh["host"] as? String ?? ""
            let user = ssh["user"] as? String ?? ""
            guard !host.isEmpty, !user.isEmpty else {
                self.push(["t": "createSshProject", "ok": false, "name": name,
                           "error": "Enter the host and user to connect as."])
                return
            }
            guard self.world.projectIndex(name) == nil else {
                self.push(["t": "createSshProject", "ok": false, "name": name,
                           "error": "A project named “\(name)” already exists."])
                return
            }
            self.world.projects.append(DemoWorld.Project(
                name: name, label: name, running: false, isRemote: true,
                services: [DemoWorld.Svc(name: "shell", cmd: "ssh \(user)@\(host)",
                                         port: 0, running: false)]))
            self.world.sidebarOrder.append(name)
            self.demoCreateTerminals(project: name, copyOf: nil)
            self.push(["t": "createSshProject", "ok": true, "name": name])
            self.pushAfter(0.1) { ["t": "projects-changed"] }
        }
        register("cloneProject") { [weak self] o in
            guard let self, let name = o["name"] as? String else { return }
            let url = (o["url"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !url.isEmpty else {
                self.push(["t": "cloneProject", "ok": false, "name": name,
                           "error": "Enter a repository address."])
                return
            }
            guard self.world.projectIndex(name) == nil else {
                self.push(["t": "cloneProject", "ok": false, "name": name,
                           "error": "A project named “\(name)” already exists."])
                return
            }
            self.pushAfter(2.2) { [weak self] in
                guard let self, self.world.projectIndex(name) == nil else { return nil }
                self.demoAddProject(name: name, copyOf: nil)
                self.demoCloneGitState(from: "blog", to: name)
                self.push(["t": "projects-changed"])
                return ["t": "cloneProject", "ok": true, "name": name]
            }
        }
        register("listDirs") { [weak self] o in
            guard let self else { return }
            let path = self.canonicalPath(o["path"] as? String ?? "")
            var reply: [String: Any] = ["t": "listDirs", "ok": true, "path": path,
                                        "dirs": self.demoDirs(path)]
            if let parent = self.parentPath(path) { reply["parent"] = parent }
            self.push(reply)
        }
        register("listSshHosts") { [weak self] _ in
            self?.push(["t": "listSshHosts", "ok": true, "hosts": [
                ["name": "dev-server", "hostName": "dev-server.local", "user": "demo",
                 "port": 22, "identityFile": ""],
                ["name": "staging", "hostName": "staging.internal", "user": "deploy",
                 "port": 22, "identityFile": "~/.ssh/id_ed25519"],
            ]])
        }
    }

    private func canonicalPath(_ raw: String) -> String {
        var p = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if p.isEmpty || p == "~" { return "/Users/demo" }
        if p.hasPrefix("~/") { p = "/Users/demo/" + p.dropFirst(2) }
        while p.count > 1 && p.hasSuffix("/") { p.removeLast() }
        return p
    }

    private func parentPath(_ path: String) -> String? {
        guard path != "/" else { return nil }
        let up = path.split(separator: "/").dropLast()
        return up.isEmpty ? "/" : "/" + up.joined(separator: "/")
    }

    private func demoDirs(_ path: String) -> [String] {
        switch path {
        case "/": return ["Applications", "Library", "System", "Users"]
        case "/Users": return ["Shared", "demo"]
        case "/Users/demo": return ["Desktop", "Developer", "Documents", "Downloads", "Projects"]
        case "/Users/demo/Projects":
            return ["api-gateway", "blog", "design-system", "mobile-app", "storefront"]
        case "/Users/demo/Developer": return ["experiments", "playground"]
        default: return []
        }
    }

    // MARK: sidebar folder ops

    private func registerSidebarHandlers() {
        register("sidebarCreateFolder") { [weak self] o in
            guard let self, let name = o["name"] as? String, !name.isEmpty else { return }
            if !self.world.folders.contains(where: { $0.name.caseInsensitiveCompare(name) == .orderedSame }) {
                let id = self.slug(name)
                self.world.folders.append(DemoWorld.Folder(id: id, name: name,
                                                           collapsed: false, members: []))
                self.world.sidebarOrder.append("group:\(id)")
            }
            self.sidebarMutationReply("sidebarCreateFolder")
        }
        register("sidebarRenameFolder") { [weak self] o in
            guard let self, let name = o["name"] as? String,
                  let newName = o["newName"] as? String else { return }
            if let fi = self.world.folders.firstIndex(where: { $0.name.caseInsensitiveCompare(name) == .orderedSame }) {
                self.world.folders[fi].name = newName
            }
            self.sidebarMutationReply("sidebarRenameFolder")
        }
        register("sidebarDeleteFolder") { [weak self] o in
            guard let self, let name = o["name"] as? String else { return }
            if let fi = self.world.folders.firstIndex(where: { $0.name.caseInsensitiveCompare(name) == .orderedSame }) {
                let folder = self.world.folders[fi]
                if let ti = self.world.sidebarOrder.firstIndex(of: "group:\(folder.id)") {
                    self.world.sidebarOrder.replaceSubrange(ti...ti, with: folder.members)
                } else {
                    self.world.sidebarOrder.append(contentsOf: folder.members)
                }
                self.world.folders.remove(at: fi)
            }
            self.sidebarMutationReply("sidebarDeleteFolder")
        }
        register("sidebarMoveProject") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            self.moveProjectToFolder(project, folder: o["folder"] as? String)
            self.sidebarMutationReply("sidebarMoveProject")
        }
    }

    // MARK: actions (terminal relay + background runs)

    private func registerActionHandlers() {
        register("runAction") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let actionName = o["action"] as? String else { return }
            guard let p = self.world.project(named: project),
                  let action = self.findAction(actionName, in: p.actions) else {
                self.push(["t": "runAction", "ok": false, "project": project,
                           "error": "That action isn't available."])
                return
            }
            let values = o["inputValues"] as? [String: String] ?? [:]
            let cmd = self.substitute(action["cmd"] as? String ?? actionName, values)
            let label = (action["label"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? actionName
            let id = "demo-\(project)-run-\(Int(Date().timeIntervalSince1970 * 1000))"
            self.world.terminals[project, default: []].append(
                DemoWorld.Terminal(id: id, label: label, project: project,
                                   buffer: self.shellPrompt(project) + cmd + "\r\n"))
            self.push(["t": "runAction", "ok": true])
            self.writeToTerminalAfter(1.0, id: id,
                                      text: self.commandOutput(cmd: cmd, project: project))
        }
        register("runActionBackground") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let actionName = o["action"] as? String,
                  let runId = o["runId"] as? String else { return }
            guard let p = self.world.project(named: project),
                  let action = self.findAction(actionName, in: p.actions) else {
                self.push(["t": "runActionBackground", "ok": false, "runId": runId,
                           "error": "That action isn't available."])
                return
            }
            let values = o["inputValues"] as? [String: String] ?? [:]
            let cmd = self.substitute(action["cmd"] as? String ?? actionName, values)
            let label = (action["label"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? actionName
            let now = Date().timeIntervalSince1970
            let (duration, lines) = self.bgRunScript(cmd: cmd, project: project, values: values)
            self.world.backgroundRuns.append(DemoWorld.BgRun(
                runId: runId, project: project, label: label,
                startedAt: Int(now), startedRef: now, duration: duration, lines: lines))
            self.push(["t": "runActionBackground", "ok": true])
        }
        register("actionBgOutput") { [weak self] o in
            guard let self, let runId = o["runId"] as? String else { return }
            self.reapExpiredRuns()
            guard let run = self.world.backgroundRuns.first(where: { $0.runId == runId }) else {
                self.push(["t": "actionBgOutput", "ok": true, "found": false, "runId": runId])
                return
            }
            var reply = self.bgRunSnapshot(run)
            reply["t"] = "actionBgOutput"
            reply["ok"] = true
            reply["found"] = true
            self.push(reply)
        }
        register("cancelActionBackground") { [weak self] o in
            guard let self, let runId = o["runId"] as? String else { return }
            if let idx = self.world.backgroundRuns.firstIndex(where: { $0.runId == runId }),
               self.world.backgroundRuns[idx].cancelledAt == nil,
               Date().timeIntervalSince1970 - self.world.backgroundRuns[idx].startedRef
                   < self.world.backgroundRuns[idx].duration {
                self.world.backgroundRuns[idx].cancelledAt = Date().timeIntervalSince1970
            }
            self.push(["t": "cancelActionBackground", "ok": true, "runId": runId])
        }
        register("backgroundRuns") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            self.reapExpiredRuns()
            let runs = self.world.backgroundRuns
                .filter { $0.project == project }
                .sorted { $0.startedAt > $1.startedAt }
                .map { run -> [String: Any] in
                    var d = self.bgRunSnapshot(run)
                    d.removeValue(forKey: "project")
                    d.removeValue(forKey: "text")
                    return d
                }
            self.push(["t": "backgroundRuns", "ok": true, "project": project, "runs": runs])
        }
    }

    private func bgRunSnapshot(_ run: DemoWorld.BgRun) -> [String: Any] {
        let now = Date().timeIntervalSince1970
        let cutoff = min(now, run.cancelledAt ?? now) - run.startedRef
        let running = run.cancelledAt == nil && now - run.startedRef < run.duration
        let cancelled = run.cancelledAt != nil
        let text = run.lines.filter { $0.at <= cutoff }.map(\.text).joined(separator: "\n")
        return ["runId": run.runId, "project": run.project, "label": run.label,
                "startedAt": run.startedAt, "text": text.isEmpty ? text : text + "\n",
                "running": running, "success": !cancelled && !running,
                "error": cancelled ? "cancelled" : ""]
    }

    private func reapExpiredRuns() {
        let now = Date().timeIntervalSince1970
        world.backgroundRuns.removeAll { run in
            let end = run.cancelledAt ?? (run.startedRef + run.duration)
            let finished = run.cancelledAt != nil || now - run.startedRef >= run.duration
            return finished && now - end > 300
        }
    }

    private func bgRunScript(cmd: String, project: String,
                             values: [String: String]) -> (Double, [DemoWorld.BgRunLine]) {
        func line(_ at: Double, _ text: String) -> DemoWorld.BgRunLine {
            DemoWorld.BgRunLine(at: at, text: text)
        }
        let c = cmd.lowercased()
        if c.contains("go test") {
            return (6.0, [
                line(0, "$ \(cmd)"),
                line(1.1, "ok  \(project)/internal/auth  0.31s"),
                line(2.3, "ok  \(project)/internal/routes  0.58s"),
                line(3.6, "ok  \(project)/internal/store  0.74s"),
                line(4.8, "ok  \(project)/cmd/server  0.22s"),
                line(5.7, "PASS"),
            ])
        }
        if c.contains("clean") {
            return (5.5, [
                line(0, "$ \(cmd)"),
                line(0.9, "Removing node_modules/.cache…"),
                line(2.2, "Removing .expo…"),
                line(3.4, "Resetting the bundler cache…"),
                line(5.2, "Caches cleared."),
            ])
        }
        if c.contains("new-post") {
            let title = values["title"] ?? "untitled"
            return (4.5, [
                line(0, "$ \(cmd)"),
                line(1.0, "Creating a new draft…"),
                line(2.4, "posts/\(slug(title)).md created"),
                line(4.2, "Draft ready — happy writing!"),
            ])
        }
        return (5.0, [
            line(0, "$ \(cmd)"),
            line(1.2, "Running…"),
            line(4.6, "Done."),
        ])
    }

    private func commandOutput(cmd: String, project: String) -> String {
        let c = cmd.lowercased()
        let lines: [String]
        if c.contains("go test") {
            lines = ["ok  \(project)/internal/auth  0.31s",
                     "ok  \(project)/internal/routes  0.58s",
                     "ok  \(project)/cmd/server  0.22s",
                     "PASS"]
        } else if c.contains("test") {
            lines = [" RUN  v3.1.4 /Users/demo/Projects/\(project)",
                     "",
                     " ✓ lib/payments.test.ts (6 tests) 41ms",
                     " ✓ components/CheckoutForm.test.tsx (9 tests) 187ms",
                     " ✓ app/checkout/page.test.tsx (4 tests) 96ms",
                     "",
                     " Test Files  3 passed (3)",
                     "      Tests  19 passed (19)",
                     "   Duration  1.24s"]
        } else if c.contains("lint") {
            lines = ["> \(project)@1.4.2 lint",
                     "> next lint",
                     "",
                     "✔ No ESLint warnings or errors"]
        } else if c.contains("build") {
            lines = ["▲ Next.js 15.3.2",
                     "Creating an optimized production build…",
                     "✓ Compiled successfully"]
        } else {
            lines = ["Done."]
        }
        return lines.joined(separator: "\r\n")
    }

    private func serviceLogText(svc: DemoWorld.Svc, ticks: Int) -> String {
        let (header, pool) = logTemplate(svc)
        var lines = header
        let extra = min(3 + ticks * 2, 60)
        for i in 0..<extra { lines.append(pool[i % pool.count]) }
        return lines.joined(separator: "\n") + "\n"
    }

    private func logTemplate(_ svc: DemoWorld.Svc) -> ([String], [String]) {
        switch svc.name {
        case "web":
            return (["▲ Next.js 15.3.2",
                     "- Local:        http://localhost:3000",
                     "✓ Ready in 1.2s",
                     ""],
                    ["GET / 200 in 41ms",
                     "GET /products 200 in 63ms",
                     "GET /checkout 200 in 57ms",
                     "POST /api/cart 200 in 22ms",
                     "GET /products/canvas-tote 200 in 48ms",
                     "GET /api/health 200 in 4ms"])
        case "api":
            return (["api listening on http://localhost:4000", ""],
                    ["POST /v1/cart 200 18ms",
                     "GET /v1/products 200 12ms",
                     "POST /v1/checkout/intent 201 44ms",
                     "GET /v1/products/canvas-tote 200 9ms",
                     "GET /v1/health 200 2ms"])
        case "worker":
            return (["worker ready — waiting for jobs", ""],
                    ["processed email-receipt #1042 (320ms)",
                     "processed image-resize #1043 (911ms)",
                     "processed inventory-sync #1044 (204ms)"])
        case "server":
            return (["listening on :8080", ""],
                    ["GET /healthz 200 1ms",
                     "POST /v1/token 200 12ms",
                     "GET /v1/routes 200 7ms"])
        case "metro":
            return (["Welcome to Metro",
                     "Dev server ready on http://localhost:8081",
                     ""],
                    ["BUNDLE ./index.js ▓▓▓▓▓▓▓▓▓▓ 100.0% (612/612)",
                     "LOG Running \"mobile-app\" with 1 root tag"])
        case "storybook":
            return (["Storybook started",
                     "Local: http://localhost:6006/",
                     ""],
                    ["info => Serving static files from ./public",
                     "compiled successfully"])
        default:
            return (["> \(svc.cmd)",
                     "Local http://localhost:\(svc.port)/",
                     "watching for file changes…"],
                    ["200 / (12ms)",
                     "200 /posts/hello-world (18ms)",
                     "200 /about (9ms)"])
        }
    }

    // MARK: cross-domain hooks

    /// Add a project to the world — a fresh empty project (`copyOf` nil) or a
    /// duplicate of an existing one. Called by createProject/duplicate.
    func demoAddProject(name: String, copyOf: String?) {
        guard world.projectIndex(name) == nil else { return }
        if let copyOf, var p = world.project(named: copyOf) {
            p.name = name
            p.label = name
            p.parentName = copyOf
            p.running = false
            p.activeProfile = ""
            for i in p.services.indices { p.services[i].running = false }
            p.status = []
            world.projects.append(p)
            demoCreateTerminals(project: name, copyOf: copyOf)
            demoCloneGitState(from: copyOf, to: name)
        } else {
            world.projects.append(DemoWorld.Project(
                name: name, label: name, running: false,
                services: [DemoWorld.Svc(name: "dev", cmd: "npm run dev", port: 3000,
                                         running: false)]))
            world.sidebarOrder.append(name)
            demoCreateTerminals(project: name, copyOf: nil)
        }
    }

    /// Set a project's agent-status entries and push a `status-changed`. Called by
    /// the terminal engine at Claude-script milestones.
    func demoSetAgentStatus(project: String, entries: [[String: Any]]) {
        guard let idx = world.projectIndex(project) else { return }
        let nowMs = Int(Date().timeIntervalSince1970 * 1000)
        world.projects[idx].status = entries.map { e in
            DemoWorld.Status(key: e["key"] as? String ?? "",
                             value: e["value"] as? String ?? "",
                             priority: e["priority"] as? Int ?? 0,
                             timestamp: e["timestamp"] as? Int ?? nowMs)
        }
        push(["t": "status-changed", "project": project])
    }

    // MARK: helpers

    private func sidebarMutationReply(_ t: String) {
        var o = world.sidebarPayload()
        o["t"] = t
        o["ok"] = true
        push(o)
    }

    private func moveProjectToFolder(_ project: String, folder: String?) {
        for i in world.folders.indices { world.folders[i].members.removeAll { $0 == project } }
        world.sidebarOrder.removeAll { $0 == project }
        guard let folder, !folder.isEmpty else {
            world.sidebarOrder.append(project)
            return
        }
        let fi: Int
        if let existing = world.folders.firstIndex(where: { $0.name.caseInsensitiveCompare(folder) == .orderedSame }) {
            fi = existing
        } else {
            let id = slug(folder)
            world.folders.append(DemoWorld.Folder(id: id, name: folder,
                                                  collapsed: false, members: []))
            world.sidebarOrder.append("group:\(id)")
            fi = world.folders.count - 1
        }
        world.folders[fi].members.append(project)
    }

    private func ensureShellTerminal(_ project: String) {
        guard world.terminals[project]?.contains(where: { $0.cli.isEmpty }) != true else { return }
        let n = (world.terminals[project]?.count ?? 0) + 1
        let id = "demo-\(project)-shell-\(Int(Date().timeIntervalSince1970 * 1000))"
        world.terminals[project, default: []].append(
            DemoWorld.Terminal(id: id, label: "Terminal \(n)", project: project,
                               buffer: shellPrompt(project)))
    }

    private func writeToShellAfter(_ seconds: Double, project: String, text: String) {
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in
            self?.demoWriteToShell(project: project, text: text)
        }
    }

    private func writeToTerminalAfter(_ seconds: Double, id: String, text: String) {
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in
            self?.demoWriteToTerminal(id: id, text: text)
        }
    }

    func findAction(_ name: String, in actions: [[String: Any]]) -> [String: Any]? {
        for a in actions {
            if a["name"] as? String == name { return a }
            if let children = a["children"] as? [[String: Any]],
               let hit = findAction(name, in: children) {
                return hit
            }
        }
        return nil
    }

    private func substitute(_ cmd: String, _ values: [String: String]) -> String {
        var out = cmd
        for (k, v) in values { out = out.replacingOccurrences(of: "{{\(k)}}", with: v) }
        return out
    }

    private func uniqueProjectName(_ base: String, reserved: Set<String> = []) -> String {
        let root = slug(base)
        var name = root
        var n = 2
        while world.projectIndex(name) != nil || reserved.contains(name) {
            name = "\(root)-\(n)"
            n += 1
        }
        return name
    }

    private func slug(_ s: String) -> String {
        let lowered = s.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        let mapped = lowered.map { $0.isLetter || $0.isNumber ? $0 : "-" }
        var out = String(mapped)
        while out.contains("--") { out = out.replacingOccurrences(of: "--", with: "-") }
        return out.trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    }

    // MARK: fixture file contents

    private func demoFileContent(project: String, path: String) -> String {
        switch path {
        case "package.json" where project.hasPrefix("storefront"):
            return Self.storefrontPackageJson
        case "components/CheckoutForm.tsx": return Self.checkoutFormTsx
        case "app/checkout/page.tsx": return Self.checkoutPageTsx
        case "lib/payments.ts": return Self.paymentsTs
        case "README.md" where project.hasPrefix("storefront"):
            return Self.storefrontReadme
        default: return fallbackFile(project: project, path: path)
        }
    }

    private func fallbackFile(project: String, path: String) -> String {
        let name = path.split(separator: "/").last.map(String.init) ?? path
        if path.hasSuffix(".md") {
            return "# \(name)\n\nNotes for the \(project) project.\n"
        }
        if path.hasSuffix(".json") {
            return "{\n  \"name\": \"\(project)\",\n  \"version\": \"0.1.0\",\n  \"private\": true\n}\n"
        }
        if path.hasSuffix(".go") {
            return "package main\n\nimport \"log\"\n\nfunc main() {\n\tlog.Println(\"\(project) starting\")\n}\n"
        }
        return "// \(name)\n// Part of the \(project) project.\nexport {}\n"
    }

    private static let storefrontPackageJson = """
    {
      "name": "storefront",
      "version": "1.4.2",
      "private": true,
      "scripts": {
        "dev": "next dev",
        "api": "npm run api",
        "worker": "npm run worker",
        "build": "next build",
        "test": "vitest run",
        "lint": "next lint"
      },
      "dependencies": {
        "next": "15.3.2",
        "react": "19.1.0",
        "react-dom": "19.1.0",
        "zod": "3.24.1"
      },
      "devDependencies": {
        "typescript": "5.8.2",
        "vitest": "3.1.4"
      }
    }
    """

    private static let checkoutFormTsx = #"""
    "use client"

    import { useState } from "react"
    import { z } from "zod"
    import { createPaymentIntent } from "../lib/payments"

    const checkoutSchema = z.object({
      email: z.string().email("Enter a valid email"),
      name: z.string().min(2, "Enter the name on the card"),
      card: z.string().regex(/^\d{16}$/, "Enter a 16-digit card number"),
      expiry: z.string().regex(/^\d{2}\/\d{2}$/, "Use MM/YY"),
      cvc: z.string().regex(/^\d{3,4}$/, "Enter the security code"),
    })

    type Errors = Partial<Record<string, string>>

    export function CheckoutForm({ total }: { total: number }) {
      const [errors, setErrors] = useState<Errors>({})
      const [submitting, setSubmitting] = useState(false)

      async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        const parsed = checkoutSchema.safeParse(Object.fromEntries(form))
        if (!parsed.success) {
          setErrors(Object.fromEntries(
            parsed.error.issues.map(issue => [issue.path[0], issue.message]),
          ))
          return
        }
        setErrors({})
        setSubmitting(true)
        try {
          await createPaymentIntent({ amount: total, email: parsed.data.email })
        } finally {
          setSubmitting(false)
        }
      }

      return (
        <form onSubmit={onSubmit} className="grid gap-4">
          <Field name="email" label="Email" error={errors.email} />
          <Field name="name" label="Name on card" error={errors.name} />
          <Field name="card" label="Card number" error={errors.card} inputMode="numeric" />
          <div className="grid grid-cols-2 gap-4">
            <Field name="expiry" label="Expiry" error={errors.expiry} placeholder="MM/YY" />
            <Field name="cvc" label="CVC" error={errors.cvc} inputMode="numeric" />
          </div>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? "Processing…" : "Pay now"}
          </button>
        </form>
      )
    }
    """#

    private static let checkoutPageTsx = """
    import { CheckoutForm } from "../../components/CheckoutForm"
    import { OrderSummary } from "../../components/OrderSummary"
    import { getCart } from "../../lib/cart"

    export const metadata = { title: "Checkout — storefront" }

    export default async function CheckoutPage() {
      const cart = await getCart()
      return (
        <main className="mx-auto max-w-2xl px-6 py-12">
          <h1 className="text-2xl font-semibold">Checkout</h1>
          <OrderSummary items={cart.items} total={cart.total} />
          <CheckoutForm total={cart.total} />
        </main>
      )
    }
    """

    private static let paymentsTs = """
    import { z } from "zod"

    const intentResponse = z.object({
      id: z.string(),
      clientSecret: z.string(),
      status: z.enum(["requires_confirmation", "succeeded"]),
    })

    export type PaymentIntent = z.infer<typeof intentResponse>

    export async function createPaymentIntent(input: { amount: number; email: string }) {
      const res = await fetch("/api/payments/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error("Payment intent failed")
      return intentResponse.parse(await res.json())
    }

    export function formatAmount(cents: number) {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(cents / 100)
    }
    """

    private static let storefrontReadme = """
    # storefront

    A demo Next.js shop: product pages, a cart, and a checkout flow.

    ## Getting started

    - `npm install`
    - `npm run dev` — web on :3000
    - `npm run api` — API on :4000

    ## Scripts

    - `npm test` — run the unit tests
    - `npm run lint` — lint the codebase

    ## Structure

    - `app/` — routes (App Router)
    - `components/` — UI components
    - `lib/` — payments, cart, and API helpers
    """
}

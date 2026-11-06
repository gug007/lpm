import Foundation

private let serviceKeyOrder = ["cmd", "cwd", "port", "portConflict", "env", "dependsOn"]
private let actionKeyOrder = ["label", "emoji", "cmd", "cwd", "type", "reuse", "confirm",
                              "display", "layer", "inputs", "actions"]
private let zoneKeyOrder = ["rows", "label", "display", "position", "collapsed", "layers"]
private let inputKeyOrder = ["key", "label", "type", "required", "placeholder", "default",
                             "persist", "options", "value", "position"]

/// Demo handlers for config editing — raw-YAML read/write per layer and structured
/// service/profile/action edits — plus the harmless push acks (`apnsToken`,
/// `liveActivity`, `answerAgent`), which nothing in Demo Mode sends. Reads reply
/// inline; every write replies after a short simulated worker-thread delay and
/// emits `projects-changed`, mirroring the desktop.
extension DemoServer {
    func registerConfigHandlers() {
        registerRawYamlHandlers()
        registerServiceHandlers()
        registerProfileHandlers()
        registerActionHandlers()
        register("apnsToken") { [weak self] _ in
            self?.push(["t": "apnsToken", "ok": true])
        }
        register("liveActivity") { [weak self] _ in
            self?.push(["t": "liveActivity", "ok": true])
        }
        register("answerAgent") { [weak self] o in
            if o["action"] as? String == "pick" {
                self?.answerDemoDialog(o)
                return
            }
            var reply: [String: Any] = ["t": "answerAgent", "ok": true]
            reply["reqId"] = o["reqId"]
            self?.push(reply)
        }
    }

    // MARK: raw YAML

    private func registerRawYamlHandlers() {
        register("readConfig") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let layer = o["layer"] as? String else { return }
            guard let p = self.world.project(named: project) else {
                self.push(["t": "readConfig", "ok": false, "project": project, "layer": layer,
                           "error": "Couldn't find the project."])
                return
            }
            if layer == "repo", p.isRemote {
                self.push(["t": "readConfig", "ok": true, "project": project, "layer": layer,
                           "content": "", "available": false])
                return
            }
            let content = self.world.configText[self.configKey(project, layer)]
                ?? self.defaultConfigText(p, layer: layer)
            self.push(["t": "readConfig", "ok": true, "project": project, "layer": layer,
                       "content": content, "available": true])
        }

        register("saveConfig") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let layer = o["layer"] as? String else { return }
            guard self.world.projectIndex(project) != nil else {
                self.pushAfter(0.3, ["t": "saveConfig", "ok": false, "project": project,
                                     "layer": layer, "name": project,
                                     "error": "Couldn't find the project."])
                return
            }
            self.world.configText[self.configKey(project, layer)] = o["content"] as? String ?? ""
            self.pushAfter(0.3, ["t": "saveConfig", "ok": true, "project": project,
                                 "layer": layer, "name": project])
            self.pushAfter(0.4, ["t": "projects-changed"])
        }
    }

    // MARK: services

    private func registerServiceHandlers() {
        register("serviceBody") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let key = o["key"] as? String else { return }
            guard let s = self.world.project(named: project)?.services
                .first(where: { $0.name == key }) else {
                self.push(["t": "serviceBody", "ok": false, "project": project, "key": key,
                           "error": "Couldn't read the service."])
                return
            }
            var body: [String: Any] = ["cmd": s.cmd]
            if s.port > 0 { body["port"] = s.port }
            for (k, v) in self.serviceExtras(project, key) { body[k] = v }
            self.push(["t": "serviceBody", "ok": true, "project": project, "key": key,
                       "body": body, "source": "project"])
        }

        register("saveService") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let key = o["key"] as? String else { return }
            guard let idx = self.world.projectIndex(project) else {
                self.pushAfter(0.3, ["t": "saveService", "ok": false, "project": project,
                                     "key": key, "error": "Couldn't find the project."])
                return
            }
            if let previousKey = o["previousKey"] as? String,
               !previousKey.isEmpty, previousKey != key {
                self.renameServiceReferences(idx, from: previousKey, to: key)
            }
            let payload = o["payload"] as? [String: Any] ?? [:]
            var extras = payload
            extras.removeValue(forKey: "cmd")
            extras.removeValue(forKey: "port")
            let cmd = payload["cmd"] as? String ?? ""
            let port = payload["port"] as? Int ?? 0
            if let si = self.world.projects[idx].services.firstIndex(where: { $0.name == key }) {
                self.world.projects[idx].services[si].cmd = cmd
                self.world.projects[idx].services[si].port = port
            } else {
                self.world.projects[idx].services.append(
                    DemoWorld.Svc(name: key, cmd: cmd, port: port, running: false))
            }
            if extras.isEmpty { self.world.serviceExtras.removeValue(forKey: "\(project)\n\(key)") }
            else { self.world.serviceExtras["\(project)\n\(key)"] = extras }
            self.reflowProjectLayer(project)
            self.pushAfter(0.3, ["t": "saveService", "ok": true, "project": project, "key": key])
            self.pushAfter(0.4, ["t": "projects-changed"])
        }

        register("deleteService") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let key = o["key"] as? String else { return }
            guard let idx = self.world.projectIndex(project) else {
                self.pushAfter(0.3, ["t": "deleteService", "ok": false, "project": project,
                                     "key": key, "error": "Couldn't find the project."])
                return
            }
            self.world.projects[idx].services.removeAll { $0.name == key }
            self.world.serviceExtras.removeValue(forKey: "\(project)\n\(key)")
            for pi in self.world.projects[idx].profiles.indices {
                self.world.projects[idx].profiles[pi].services.removeAll { $0 == key }
            }
            self.rewriteDependsOn(project) { $0 == key ? nil : $0 }
            self.reflowProjectLayer(project)
            self.pushAfter(0.3, ["t": "deleteService", "ok": true, "project": project, "key": key])
            self.pushAfter(0.4, ["t": "projects-changed"])
        }
    }

    // MARK: profiles

    private func registerProfileHandlers() {
        register("saveProfile") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let name = o["name"] as? String else { return }
            guard let idx = self.world.projectIndex(project) else {
                self.pushAfter(0.3, ["t": "saveProfile", "ok": false, "project": project,
                                     "name": name, "error": "Couldn't find the project."])
                return
            }
            let services = o["services"] as? [String] ?? []
            let previous = (o["previousName"] as? String).flatMap { $0.isEmpty ? nil : $0 }
            if let previous, previous != name,
               let pi = self.world.projects[idx].profiles.firstIndex(where: { $0.name == previous }) {
                self.world.projects[idx].profiles[pi].name = name
                if self.world.projects[idx].activeProfile == previous {
                    self.world.projects[idx].activeProfile = name
                }
            }
            if let pi = self.world.projects[idx].profiles.firstIndex(where: { $0.name == name }) {
                self.world.projects[idx].profiles[pi].services = services
            } else {
                self.world.projects[idx].profiles.append(
                    DemoWorld.Profile(name: name, services: services))
            }
            self.reflowProjectLayer(project)
            self.pushAfter(0.3, ["t": "saveProfile", "ok": true, "project": project, "name": name])
            self.pushAfter(0.4, ["t": "projects-changed"])
        }

        register("deleteProfile") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let name = o["name"] as? String else { return }
            guard let idx = self.world.projectIndex(project) else {
                self.pushAfter(0.3, ["t": "deleteProfile", "ok": false, "project": project,
                                     "name": name, "error": "Couldn't find the project."])
                return
            }
            self.world.projects[idx].profiles.removeAll { $0.name == name }
            if self.world.projects[idx].activeProfile == name {
                self.world.projects[idx].activeProfile = ""
            }
            self.reflowProjectLayer(project)
            self.pushAfter(0.3, ["t": "deleteProfile", "ok": true, "project": project, "name": name])
            self.pushAfter(0.4, ["t": "projects-changed"])
        }
    }

    // MARK: actions

    private func registerActionHandlers() {
        register("actionBody") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let key = o["key"] as? String else { return }
            guard let body = self.storedActionBody(project: project, key: key) else {
                self.push(["t": "actionBody", "ok": false, "project": project, "key": key,
                           "error": "Couldn't read the action."])
                return
            }
            self.push(["t": "actionBody", "ok": true, "project": project, "key": key,
                       "body": body, "section": "actions", "source": "project"])
        }

        register("saveAction") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let key = o["key"] as? String else { return }
            guard let idx = self.world.projectIndex(project) else {
                self.pushAfter(0.3, ["t": "saveAction", "ok": false, "project": project,
                                     "key": key, "error": "Couldn't find the project."])
                return
            }
            let previousKey = (o["previousKey"] as? String).flatMap { $0.isEmpty ? nil : $0 }
            let existing = self.world.projects[idx].actions
                .firstIndex { ($0["name"] as? String) == (previousKey ?? key) }
            if existing == nil, key.contains(":") {
                self.pushAfter(0.3, ["t": "saveAction", "ok": false, "project": project,
                                     "key": key, "error": "Action names can't contain a colon."])
                return
            }
            var entry = o["payload"] as? [String: Any] ?? [:]
            entry["name"] = key
            entry.removeValue(forKey: "children")
            if let inputs = entry["inputs"] as? [String: Any] {
                entry["inputs"] = inputs.isEmpty ? nil : self.wireInputs(inputs)
            }
            if let children = entry["actions"] as? [String: Any] {
                entry["children"] = self.actionInfoChildren(parent: key, children)
            }
            // An unchanged template keeps the label the Mac would render from it.
            if let i = existing,
               let template = self.world.projects[idx].actions[i]["configLabel"] as? String,
               (entry["label"] as? String) == template {
                entry["configLabel"] = template
                entry["label"] = self.world.projects[idx].actions[i]["label"]
            }
            // An unchanged popup keeps the card the Mac makes from it.
            if let i = existing,
               let config = self.world.projects[idx].actions[i]["configPopup"] as? [String: String],
               entry["popup"] as? [String: String] == config {
                entry["configPopup"] = config
                entry["popup"] = self.world.projects[idx].actions[i]["popup"]
            }
            if let i = existing { self.world.projects[idx].actions[i] = entry }
            else { self.world.projects[idx].actions.append(entry) }
            self.reflowProjectLayer(project)
            self.pushAfter(0.3, ["t": "saveAction", "ok": true, "project": project, "key": key])
            self.pushAfter(0.4, ["t": "projects-changed"])
        }

        register("deleteAction") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let key = o["key"] as? String else { return }
            guard let idx = self.world.projectIndex(project) else {
                self.pushAfter(0.3, ["t": "deleteAction", "ok": false, "project": project,
                                     "key": key, "error": "Couldn't find the project."])
                return
            }
            self.world.projects[idx].actions.removeAll { ($0["name"] as? String) == key }
            self.reflowProjectLayer(project)
            self.pushAfter(0.3, ["t": "deleteAction", "ok": true, "project": project, "key": key])
            self.pushAfter(0.4, ["t": "projects-changed"])
        }
    }

    // MARK: world helpers

    // A duplicate reads and writes its parent's project file, and the global layer
    // is one file shared by every project — normalize both into the storage key.
    private func configKey(_ project: String, _ layer: String) -> String {
        if layer == "global" { return "*\nglobal" }
        let parent = world.project(named: project)?.parentName ?? ""
        return "\(parent.isEmpty ? project : parent)\n\(layer)"
    }

    // A structured edit rewrites the layer file (comments reflow on the desktop),
    // so stored raw text goes stale — drop it and regenerate from the world on the
    // next read.
    private func reflowProjectLayer(_ project: String) {
        world.configText.removeValue(forKey: configKey(project, "project"))
    }

    private func serviceExtras(_ project: String, _ key: String) -> [String: Any] {
        if let e = world.serviceExtras["\(project)\n\(key)"] { return e }
        if let parent = world.project(named: project)?.parentName, !parent.isEmpty {
            return world.serviceExtras["\(parent)\n\(key)"] ?? [:]
        }
        return [:]
    }

    private func renameServiceReferences(_ idx: Int, from old: String, to new: String) {
        let project = world.projects[idx].name
        if let si = world.projects[idx].services.firstIndex(where: { $0.name == old }) {
            world.projects[idx].services[si].name = new
        }
        if let e = world.serviceExtras.removeValue(forKey: "\(project)\n\(old)") {
            world.serviceExtras["\(project)\n\(new)"] = e
        }
        for pi in world.projects[idx].profiles.indices {
            world.projects[idx].profiles[pi].services =
                world.projects[idx].profiles[pi].services.map { $0 == old ? new : $0 }
        }
        rewriteDependsOn(project) { $0 == old ? new : $0 }
    }

    private func rewriteDependsOn(_ project: String, _ transform: (String) -> String?) {
        for (k, extras) in world.serviceExtras where k.hasPrefix("\(project)\n") {
            guard let deps = extras["dependsOn"] as? [String] else { continue }
            var updated = extras
            let mapped = deps.compactMap(transform)
            if mapped.isEmpty { updated.removeValue(forKey: "dependsOn") }
            else { updated["dependsOn"] = mapped }
            world.serviceExtras[k] = updated
        }
    }

    private func storedActionBody(project: String, key: String) -> [String: Any]? {
        guard let actions = world.project(named: project)?.actions else { return nil }
        let parts = key.split(separator: ":", maxSplits: 1).map(String.init)
        guard let top = actions.first(where: { ($0["name"] as? String) == parts[0] }) else {
            return nil
        }
        let body = configBody(top)
        if parts.count == 2 {
            return (body["actions"] as? [String: Any])?[parts[1]] as? [String: Any]
        }
        return body
    }

    /// The action as its config file holds it: a rendered label goes back to the
    /// template the Mac rendered it from, and a popup to what the config says.
    private func configBody(_ action: [String: Any]) -> [String: Any] {
        var body = action
        body.removeValue(forKey: "name")
        body.removeValue(forKey: "children")
        if let template = body.removeValue(forKey: "configLabel") { body["label"] = template }
        if let popup = body.removeValue(forKey: "configPopup") { body["popup"] = popup }
        if let inputs = body["inputs"] as? [[String: Any]] {
            body["inputs"] = ActionInputsYaml.map(from: ActionInputsYaml.drafts(from: inputs))
        }
        return body
    }

    /// An `inputs` mapping as the projects list carries it: in prompt order, each
    /// input with its key and every choice as a label and value.
    private func wireInputs(_ map: [String: Any]) -> [[String: Any]] {
        ActionInputsYaml.ordered(map.mapValues { $0 as? [String: Any] ?? [:] }).map { entry in
            var input = entry.body
            input["key"] = entry.key
            input.removeValue(forKey: "position")
            if let options = entry.body["options"] as? [Any] {
                input["options"] = options.compactMap { option -> [String: Any]? in
                    if let value = option as? String { return ["label": value, "value": value] }
                    return option as? [String: Any]
                }
            }
            return input
        }
    }

    private func actionInfoChildren(parent: String, _ map: [String: Any]) -> [[String: Any]] {
        map.compactMap { childKey, value -> [String: Any]? in
            guard var child = value as? [String: Any] else { return nil }
            child["name"] = "\(parent):\(childKey)"
            return child
        }
        .sorted {
            let a = ($0["label"] as? String) ?? ($0["name"] as? String) ?? ""
            let b = ($1["label"] as? String) ?? ($1["name"] as? String) ?? ""
            return a.localizedCaseInsensitiveCompare(b) == .orderedAscending
        }
    }

    // MARK: default layer content

    private func defaultConfigText(_ p: DemoWorld.Project, layer: String) -> String {
        switch layer {
        case "project":
            return projectYaml(p)
        case "repo":
            return p.name == "storefront"
                ? "# Shared configuration checked into the repo.\n# Everyone who clones this project gets these settings.\n"
                : ""
        default:
            return "# Applies to every project on this Mac.\n# Services and actions added here show up everywhere.\n"
        }
    }

    private func projectYaml(_ p: DemoWorld.Project) -> String {
        var out = ""
        if !p.services.isEmpty {
            out += "services:\n"
            for s in p.services {
                var body: [String: Any] = ["cmd": s.cmd]
                if s.port > 0 { body["port"] = s.port }
                for (k, v) in serviceExtras(p.name, s.name) { body[k] = v }
                out += "  \(s.name):\n" + yamlLines(body, indent: 4, order: serviceKeyOrder)
            }
        }
        if !p.profiles.isEmpty {
            out += "profiles:\n"
            for profile in p.profiles {
                out += "  \(profile.name): [\(profile.services.joined(separator: ", "))]\n"
            }
        }
        if !p.actions.isEmpty {
            out += "actions:\n"
            for a in p.actions {
                guard let name = a["name"] as? String else { continue }
                let body = configBody(a)
                if body.count == 1, let cmd = body["cmd"] as? String {
                    out += "  \(name): \(yamlScalar(cmd))\n"
                } else {
                    out += "  \(name):\n" + yamlLines(body, indent: 4, order: actionKeyOrder)
                }
            }
        }
        if !p.zones.isEmpty {
            out += "zones:\n"
            for zone in p.zones {
                guard let name = zone["name"] as? String else { continue }
                out += "  \(name):\n" + yamlLines(zoneBody(zone), indent: 4, order: zoneKeyOrder)
            }
        }
        return out
    }

    /// A zone as its config file holds it: the header is the default display,
    /// and layers are keyed by name.
    private func zoneBody(_ zone: [String: Any]) -> [String: Any] {
        var body = zone
        for key in ["name", "source"] { body.removeValue(forKey: key) }
        if body["display"] as? String != "footer" { body.removeValue(forKey: "display") }
        if let layers = body.removeValue(forKey: "layers") as? [[String: Any]], !layers.isEmpty {
            body["layers"] = Dictionary(layers.compactMap { layer -> (String, [String: Any])? in
                guard let name = layer["name"] as? String else { return nil }
                return (name, layer.filter { $0.key != "name" })
            }, uniquingKeysWith: { first, _ in first })
        }
        return body
    }

    // MARK: YAML emitter

    private func yamlLines(_ dict: [String: Any], indent: Int, order: [String]) -> String {
        let keys = dict.keys.sorted { a, b in
            let ia = order.firstIndex(of: a) ?? order.count
            let ib = order.firstIndex(of: b) ?? order.count
            return ia == ib ? a < b : ia < ib
        }
        return keys.map { yamlEntry(key: $0, value: dict[$0]!, indent: indent) }.joined()
    }

    private func yamlEntry(key: String, value: Any, indent: Int) -> String {
        let pad = String(repeating: " ", count: indent)
        if let scalar = yamlScalarString(value) {
            return "\(pad)\(key): \(scalar)\n"
        }
        if let list = value as? [String] {
            return "\(pad)\(key): [\(list.map { yamlScalar($0) }.joined(separator: ", "))]\n"
        }
        if let rows = value as? [[String: Any]] {
            return "\(pad)\(key):\n" + rows.map { yamlListItem($0, indent: indent + 2) }.joined()
        }
        if let items = value as? [Any] {
            return "\(pad)\(key):\n" + items.map { item in
                if let row = item as? [String: Any] { return yamlListItem(row, indent: indent + 2) }
                return "\(pad)  - \(yamlScalarString(item) ?? "\(item)")\n"
            }.joined()
        }
        if let map = value as? [String: Any] {
            let order = key == "actions" ? actionKeyOrder : inputKeyOrder
            return "\(pad)\(key):\n" + yamlLines(map, indent: indent + 2, order: order)
        }
        return "\(pad)\(key): \(value)\n"
    }

    private func yamlListItem(_ row: [String: Any], indent: Int) -> String {
        let body = yamlLines(row, indent: indent + 2, order: inputKeyOrder)
        var lines = body.split(separator: "\n", omittingEmptySubsequences: true).map(String.init)
        guard !lines.isEmpty else { return "" }
        lines[0] = String(repeating: " ", count: indent) + "- "
            + lines[0].trimmingCharacters(in: .whitespaces)
        return lines.joined(separator: "\n") + "\n"
    }

    private func yamlScalarString(_ value: Any) -> String? {
        if let s = value as? String { return yamlScalar(s) }
        if let n = value as? NSNumber {
            if CFGetTypeID(n) == CFBooleanGetTypeID() { return n.boolValue ? "true" : "false" }
            if n.doubleValue == n.doubleValue.rounded() { return "\(n.intValue)" }
            return "\(n.doubleValue)"
        }
        return nil
    }

    private func yamlScalar(_ s: String) -> String {
        let special = "#&*!|>%@`\"'{}[],-"
        let reserved = ["true", "false", "yes", "no", "null", "~"]
        let plain = !s.isEmpty && !s.contains("\n") && !s.contains(": ") && !s.contains(" #")
            && !special.contains(s.first!) && s.first != " " && s.last != " " && s.last != ":"
            && !reserved.contains(s.lowercased()) && Double(s) == nil
        if plain { return s }
        let escaped = s.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
            .replacingOccurrences(of: "\n", with: "\\n")
        return "\"\(escaped)\""
    }
}

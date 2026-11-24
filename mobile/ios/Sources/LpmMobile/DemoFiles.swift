import Foundation

/// Demo handler for Files: each project's folders, built from the same tree its
/// @-mention index lists, with the demo's git changes marked, plus the folders
/// git ignores (which the index leaves out).
extension DemoServer {
    func registerFilesHandlers() {
        register("listDir") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            let asked = o["dir"] as? String ?? ""
            let entries = asked.hasPrefix("/") ? self.demoOutside(asked)?.entries
                : self.demoListing(project, dir: asked.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
            var reply: [String: Any] = ["t": "listDir", "project": project, "dir": asked]
            if self.world.project(named: project)?.isRemote == true {
                reply["ok"] = false
                reply["error"] = "Files on an SSH host open on your Mac."
            } else if let entries {
                reply["ok"] = true
                reply["entries"] = entries
                reply["root"] = "/Users/demo/dev/\(project)"
            } else {
                reply["ok"] = false
                reply["error"] = "That folder isn't there anymore."
            }
            self.pushAfter(0.25, reply)
        }
        register("locatePath") { [weak self] o in
            guard let self, let project = o["project"] as? String, let typed = o["path"] as? String else { return }
            var reply: [String: Any] = ["t": "locatePath", "project": project, "path": typed]
            if self.world.project(named: project)?.isRemote == true {
                reply["ok"] = false
                reply["error"] = "Files on an SSH host open on your Mac."
            } else {
                reply["ok"] = true
                reply.merge(self.demoLocated(project, typed)) { _, new in new }
            }
            self.pushAfter(0.15, reply)
        }
    }

    private func demoLocated(_ project: String, _ typed: String) -> [String: Any] {
        let root = "/Users/demo/dev/\(project)"
        var parts: [String] = []
        let full = typed.hasPrefix("~/") ? "/Users/demo/" + typed.dropFirst(2)
            : typed.hasPrefix("/") ? typed : root + "/" + typed
        for part in full.split(separator: "/") where part != "." {
            if part == ".." { _ = parts.popLast() } else { parts.append(String(part)) }
        }
        let path = "/" + parts.joined(separator: "/")
        guard path == root || path.hasPrefix(root + "/") else {
            return ["kind": demoOutside(path)?.kind ?? "missing", "at": path]
        }
        let rel = String(path.dropFirst(root.count + 1))
        let tree = demoTree(project)
        let kind = tree.files.contains(rel) ? "file" : tree.dirs.contains(rel) ? "dir" : "missing"
        return ["kind": kind, "at": path, "rel": rel]
    }

    /// Every project is in ~/dev: outside one there are the others, and the folders
    /// that hold them.
    private func demoOutside(_ path: String) -> (kind: String, entries: [[String: Any]]?)? {
        let roots = world.projects.filter { !$0.isRemote }.map { (name: $0.name, path: "/Users/demo/dev/\($0.name)") }
        if let root = roots.first(where: { path == $0.path || path.hasPrefix($0.path + "/") }) {
            let rel = String(path.dropFirst(root.path.count + 1))
            if demoTree(root.name).files.contains(rel) { return ("file", nil) }
            return demoListing(root.name, dir: rel).map { rows in
                ("dir", rows.map { ["name": $0["name"] ?? "", "dir": $0["dir"] ?? false, "ignored": false] })
            }
        }
        let prefix = path.hasSuffix("/") ? path : path + "/"
        let inside = roots.map(\.path).filter { $0.hasPrefix(prefix) }
        let names = Set(inside.map { String($0.dropFirst(prefix.count).prefix { $0 != "/" }) })
        guard !names.isEmpty else { return nil }
        return ("dir", names.sorted().map { ["name": $0, "dir": true, "ignored": false] })
    }

    private func demoTree(_ project: String) -> (dirs: Set<String>, files: Set<String>, ignored: [String]) {
        var dirs: Set<String> = [""]
        var files: Set<String> = []
        let changes = world.git[project]?.files ?? []
        func addParents(_ path: String) {
            var parent = (path as NSString).deletingLastPathComponent
            while !parent.isEmpty {
                dirs.insert(parent)
                parent = (parent as NSString).deletingLastPathComponent
            }
        }
        for (path, isDir) in mentionTree(project) {
            if isDir { dirs.insert(path) } else { files.insert(path) }
            addParents(path)
        }
        for change in changes where change.status != "deleted" {
            files.insert(change.path)
            addParents(change.path)
        }
        let ignored = ignoredTree(project)
        for path in ignored {
            dirs.insert(path)
            addParents(path)
        }
        return (dirs, files, ignored)
    }

    private func demoListing(_ project: String, dir: String) -> [[String: Any]]? {
        let changes = world.git[project]?.files ?? []
        let (dirs, files, ignored) = demoTree(project)
        guard dirs.contains(dir) else { return nil }

        func inDir(_ path: String) -> Bool { (path as NSString).deletingLastPathComponent == dir }
        func name(_ path: String) -> String { (path as NSString).lastPathComponent }
        let byName: (String, String) -> Bool = { name($0).localizedStandardCompare(name($1)) == .orderedAscending }

        let folderRows: [[String: Any]] = dirs.filter { !$0.isEmpty && inDir($0) }.sorted(by: byName).map { path in
            var row: [String: Any] = ["name": name(path), "dir": true,
                                      "ignored": ignored.contains { path == $0 || path.hasPrefix($0 + "/") }]
            let below = changes.filter { $0.path.hasPrefix(path + "/") }.count
            if below > 0 { row["changed"] = below }
            return row
        }
        let fileRows: [[String: Any]] = files.filter(inDir).sorted(by: byName).map { path in
            var row: [String: Any] = ["name": name(path), "dir": false, "ignored": false]
            if let change = changes.first(where: { $0.path == path }) { row["status"] = change.status }
            return row
        }
        return folderRows + fileRows
    }

    /// What a JS project's .gitignore keeps out of the index but a folder
    /// listing still shows.
    private func ignoredTree(_ project: String) -> [String] {
        let isNode = mentionTree(project).contains { $0.0 == "package.json" }
        guard isNode else { return [] }
        var paths = ["node_modules", "node_modules/react", "node_modules/react-dom", "node_modules/typescript"]
        if mentionTree(project).contains(where: { $0.0 == "next.config.mjs" }) {
            paths += [".next", "node_modules/next"]
        }
        return paths
    }
}

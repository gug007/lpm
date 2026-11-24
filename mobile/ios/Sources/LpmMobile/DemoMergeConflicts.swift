import Foundation

/// Demo Mode's merge that stopped on conflicts, in mobile-app: the branch merged into
/// main, three files with conflicts, and one it merged by itself. AI works through
/// them a file at a time, as the Mac's does.
extension DemoServer {
    func registerMergeConflictHandlers() {
        register("gitMergeResolve") { [weak self] o in
            self?.demoMergeReply("gitMergeResolve", o, after: 0.3) { merge in
                guard merge.files.contains(where: { !$0.resolved }) else { return "There are no conflicts left to resolve." }
                guard merge.run == nil else { return "AI is already resolving these conflicts." }
                merge.run = ""
                return nil
            } then: { [weak self] project in self?.demoResolve(project) }
        }
        register("gitMergeStop") { [weak self] o in
            self?.demoMergeReply("gitMergeStop", o, after: 0.2) { merge in
                guard merge.run != nil else { return "AI isn't resolving these conflicts." }
                merge.run = nil
                return nil
            } then: { [weak self] project in
                self?.push(["t": "gitMergeRun", "project": project, "running": false, "merging": true])
            }
        }
        register("gitConflictTake") { [weak self] o in
            let path = o["path"] as? String ?? ""
            self?.demoMergeReply("gitConflictTake", o) { Self.resolve(&$0, path) }
        }
        register("gitConflictResolved") { [weak self] o in
            let path = o["path"] as? String ?? ""
            self?.demoMergeReply("gitConflictResolved", o) { merge in
                if let file = merge.files.first(where: { $0.path == path }), file.conflicts > 0 {
                    return "\(path) still has conflict markers (<<<<<<< … >>>>>>>). Resolve them first."
                }
                return Self.resolve(&merge, path)
            }
        }
        register("gitMergeContinue") { [weak self] o in
            self?.demoMergeReply("gitMergeContinue", o, after: 0.6) { merge in
                merge.files.contains { !$0.resolved } ? "Some files still have conflicts. Resolve them before continuing the merge." : nil
            } then: { [weak self] project in
                self?.demoEndMerge(project)
                self?.world.git[project]?.ahead += 2
            }
        }
        register("gitMergeAbort") { [weak self] o in
            self?.demoMergeReply("gitMergeAbort", o, after: 0.4) { _ in nil } then: { [weak self] project in
                self?.demoEndMerge(project)
            }
        }
    }

    /// Answers one request on a project's merge: `act` changes it or says why it can't.
    private func demoMergeReply(_ t: String, _ o: [String: Any], after delay: Double = 0.3,
                                act: @escaping (inout DemoWorld.GitMerge) -> String?,
                                then: ((String) -> Void)? = nil) {
        let project = o["project"] as? String ?? ""
        pushAfter(delay) { [weak self] in
            guard let self else { return nil }
            guard var merge = self.world.git[project]?.merge else {
                return ["t": t, "project": project, "ok": false, "error": "No merge is in progress."]
            }
            if merge.run != nil, t != "gitMergeStop", t != "gitMergeResolve" {
                return ["t": t, "project": project, "ok": false,
                        "error": "AI is still resolving the conflicts. Stop it first."]
            }
            if let error = act(&merge) {
                return ["t": t, "project": project, "ok": false, "error": error]
            }
            self.world.git[project]?.merge = merge
            self.demoSettleConflicts(project)
            then?(project)
            self.pushGitChanged(project)
            return ["t": t, "project": project, "ok": true]
        }
    }

    private static func resolve(_ merge: inout DemoWorld.GitMerge, _ path: String) -> String? {
        guard let i = merge.files.firstIndex(where: { $0.path == path && !$0.resolved }) else {
            return "\(path) has no conflict to resolve"
        }
        merge.files[i].conflicts = 0
        merge.files[i].firstLine = 0
        merge.files[i].resolved = true
        return nil
    }

    /// A resolved file is a modified one again.
    private func demoSettleConflicts(_ project: String) {
        guard var repo = world.git[project], let merge = repo.merge else { return }
        let resolved = Set(merge.files.filter(\.resolved).map(\.path))
        for i in repo.files.indices where repo.files[i].status == "conflicted" && resolved.contains(repo.files[i].path) {
            repo.files[i].status = "modified"
            repo.files[i].stamp += "r"
            repo.files[i].diff = ""
        }
        world.git[project] = repo
    }

    private func demoEndMerge(_ project: String) {
        world.git[project]?.merge = nil
        world.git[project]?.files = []
    }

    // MARK: the AI's run

    private func demoResolve(_ project: String) {
        demoRunLine(project, "Starting claude…", after: 0.1)
        let open = (world.git[project]?.merge?.files ?? []).filter { !$0.resolved }.map(\.path)
        for (i, path) in open.enumerated() {
            let at = 1.0 + 2.5 * Double(i)
            demoRunLine(project, "Reading \((path as NSString).lastPathComponent)", after: at)
            pushAfter(at + 2.0) { [weak self] in
                guard let self, var merge = self.world.git[project]?.merge, merge.run != nil else { return nil }
                _ = Self.resolve(&merge, path)
                self.world.git[project]?.merge = merge
                self.demoSettleConflicts(project)
                self.pushGitChanged(project)
                return nil
            }
        }
        pushAfter(1.5 + 2.5 * Double(open.count)) { [weak self] in
            guard let self, self.world.git[project]?.merge?.run != nil else { return nil }
            self.world.git[project]?.merge?.run = nil
            let left = self.world.git[project]?.merge?.files.filter { !$0.resolved }.count ?? 0
            return ["t": "gitMergeRun", "project": project, "running": false, "left": left, "merging": true]
        }
    }

    private func demoRunLine(_ project: String, _ line: String, after delay: Double) {
        pushAfter(delay) { [weak self] in
            guard let self, self.world.git[project]?.merge?.run != nil else { return nil }
            self.world.git[project]?.merge?.run = line
            return ["t": "gitMergeRun", "project": project, "running": true, "line": line, "merging": false]
        }
    }
}

extension DemoWorld {
    struct GitConflict {
        var path: String
        var conflicts: Int
        var firstLine: Int
        var resolved = false
    }

    struct GitMerge {
        var source: String
        var files: [GitConflict]
        /// What the AI at it is doing; nil when none is.
        var run: String? = nil
    }

    mutating func seedMergeConflicts() {
        git["mobile-app"]?.files = [
            GitFile(path: "src/theme/colors.ts", status: "conflicted", stamp: "m1", diff: Self.conflictDiff),
            GitFile(path: "src/screens/Settings.tsx", status: "conflicted", stamp: "m2"),
            GitFile(path: "package.json", status: "conflicted", stamp: "m3"),
            GitFile(path: "src/theme/index.ts", status: "added", stamp: "m4"),
        ]
        git["mobile-app"]?.merge = GitMerge(source: "feat/dark-mode", files: [
            GitConflict(path: "src/theme/colors.ts", conflicts: 2, firstLine: 14),
            GitConflict(path: "src/screens/Settings.tsx", conflicts: 1, firstLine: 41),
            GitConflict(path: "package.json", conflicts: 1, firstLine: 27),
        ])
    }

    func gitMergeDict(_ merge: GitMerge) -> [String: Any] {
        var d: [String: Any] = [
            "merging": true, "source": merge.source,
            "files": merge.files.map {
                ["path": $0.path, "conflicts": $0.conflicts, "firstLine": $0.firstLine, "resolved": $0.resolved] as [String: Any]
            },
        ]
        if let line = merge.run { d["resolving"] = ["line": line] }
        return d
    }

    private static let conflictDiff = """
    diff --cc src/theme/colors.ts
    index 4c1b7d2,9e0f3aa..0000000
    --- a/src/theme/colors.ts
    +++ b/src/theme/colors.ts
    @@ -11,6 +11,12 @@ export const colors = {
       accent: "#4f7cff",
       danger: "#e5484d",
    +<<<<<<< HEAD
    +  background: "#fafafa",
    +=======
    +  background: light ? "#ffffff" : "#111113",
    +>>>>>>> feat/dark-mode
       border: "#e4e4e7",
     }
    """
}

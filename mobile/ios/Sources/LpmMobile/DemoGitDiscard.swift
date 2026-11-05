import Foundation

/// Demo handlers for Discard all, Discard of one file, and their Undo. As on the Mac, a discard keeps a
/// copy of the changed files and names it in the reply (none when nothing
/// changed); restoring puts that copy back unless one of its files is changed
/// again, in which case nothing is restored and the copy stays.
extension DemoServer {
    func registerGitDiscardHandlers() {
        register("gitDiscardAll") { [weak self] o in
            guard let project = o["project"] as? String else { return }
            self?.discard(project, reply: ["t": "gitDiscardAll", "project": project]) { _ in true }
        }
        register("gitDiscardFiles") { [weak self] o in
            guard let project = o["project"] as? String else { return }
            let paths = o["paths"] as? [String] ?? []
            self?.discard(project, reply: ["t": "gitDiscardFiles", "project": project, "paths": paths]) {
                paths.contains($0.path)
            }
        }
        register("gitRestoreDiscarded") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            let id = o["id"] as? String ?? ""
            self.pushAfter(0.4) { [weak self] in
                guard let self else { return nil }
                guard var repo = self.world.git[project] else {
                    return ["t": "gitRestoreDiscarded", "project": project, "ok": false,
                            "error": "Not a git repository."]
                }
                guard let kept = repo.discarded[id] else {
                    return ["t": "gitRestoreDiscarded", "project": project, "ok": false,
                            "error": "That discard is no longer kept."]
                }
                let changed = Set(repo.files.map(\.path))
                guard !kept.contains(where: { changed.contains($0.path) }) else {
                    return ["t": "gitRestoreDiscarded", "project": project, "ok": false,
                            "error": "Nothing was restored: some of its files exist again."]
                }
                repo.files = kept + repo.files
                repo.discarded[id] = nil
                self.world.git[project] = repo
                self.pushGitChanged(project)
                return ["t": "gitRestoreDiscarded", "project": project, "ok": true]
            }
        }
    }

    /// Discards the changed files `picked` takes, keeping a copy of them for Undo.
    private func discard(_ project: String, reply base: [String: Any], picked: @escaping (DemoWorld.GitFile) -> Bool) {
        pushAfter(0.4) { [weak self] in
            guard let self else { return nil }
            var reply = base
            guard var repo = self.world.git[project] else {
                reply["ok"] = false
                reply["error"] = "Not a git repository."
                return reply
            }
            reply["ok"] = true
            let kept = repo.files.filter(picked)
            if !kept.isEmpty {
                let id = "discard-\(self.world.gitDiscardNextId)"
                self.world.gitDiscardNextId += 1
                repo.discarded[id] = kept
                reply["undo"] = id
            }
            repo.files.removeAll(where: picked)
            self.world.git[project] = repo
            self.pushGitChanged(project)
            return reply
        }
    }
}

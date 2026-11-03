import Foundation

/// Demo handlers for Discard all and its Undo. As on the Mac, a discard keeps a
/// copy of the changed files and names it in the reply (none when nothing
/// changed); restoring puts that copy back unless one of its files is changed
/// again, in which case nothing is restored and the copy stays.
extension DemoServer {
    func registerGitDiscardHandlers() {
        register("gitDiscardAll") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            self.pushAfter(0.4) { [weak self] in
                guard let self else { return nil }
                guard var repo = self.world.git[project] else {
                    return ["t": "gitDiscardAll", "project": project, "ok": false,
                            "error": "Not a git repository."]
                }
                var reply: [String: Any] = ["t": "gitDiscardAll", "project": project, "ok": true]
                if !repo.files.isEmpty {
                    let id = "discard-\(self.world.gitDiscardNextId)"
                    self.world.gitDiscardNextId += 1
                    repo.discarded[id] = repo.files
                    reply["undo"] = id
                }
                repo.files = []
                self.world.git[project] = repo
                self.pushGitChanged(project)
                return reply
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
}

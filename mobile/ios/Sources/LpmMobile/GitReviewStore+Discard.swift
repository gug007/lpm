import Foundation

/// Discard all changes, and its Undo: the Mac keeps a copy for 7 days and names
/// it in the reply, so the notice can offer to put it back. A Mac that keeps no
/// copy (nothing to keep, or an older Mac) gets no Undo.
extension GitReviewStore {
    func discardAll(_ project: String) {
        startDiscard(project) { $0.gitDiscardAll(project: project) }
    }

    /// The Mac discards one file's changes and keeps a copy, as for Discard all.
    var canDiscardFiles: Bool {
        model?.client?.hostFeatures.contains(LpmClient.gitDiscardFilesFeature) == true
    }

    func discardFile(_ project: String, path: String) {
        startDiscard(project) { $0.gitDiscardFiles(project: project, paths: [path]) }
    }

    func finishDiscardFiles(_ project: String, paths: [String], undo: String?, error: String?) {
        guard endDiscard(project, error: error) else { return }
        let name = paths.count == 1 ? (paths[0] as NSString).lastPathComponent : "\(paths.count) files"
        announce(project, "Discarded changes to \(name)", discardedCopy: undo)
        load(project)
    }

    func finishDiscard(_ project: String, undo: String?, error: String?) {
        guard endDiscard(project, error: error) else { return }
        if let undo { announce(project, "Discarded all changes", discardedCopy: undo) }
        load(project)
    }

    private func startDiscard(_ project: String, send: (LpmClient) -> Void) {
        guard !discarding.contains(project) else { return }
        discarding.insert(project)
        opError[project] = nil
        if let client = model?.client { send(client) }
        armTimeout("discard", project, seconds: 60) { [weak self] in
            guard let self, self.discarding.remove(project) != nil else { return }
            self.opError[project] = GitOpError(title: "Couldn't discard changes", message: "Discarding changes timed out. Try again.")
        }
    }

    /// False when the discard failed, which changed nothing.
    private func endDiscard(_ project: String, error: String?) -> Bool {
        clearTimeout("discard", project)
        discarding.remove(project)
        guard let error else { return true }
        opError[project] = GitOpError(title: "Couldn't discard changes", message: error)
        return false
    }

    func restoreDiscarded(_ project: String, id: String) {
        guard !restoringDiscard.contains(project) else { return }
        dismissNotice(project)
        restoringDiscard.insert(project)
        opError[project] = nil
        model?.client?.gitRestoreDiscarded(project: project, id: id)
        armTimeout("restoreDiscarded", project, seconds: 60) { [weak self] in
            guard let self, self.restoringDiscard.remove(project) != nil else { return }
            self.opError[project] = GitOpError(title: Self.restoreFailedTitle,
                                               message: "Restoring the changes timed out. Check your Mac and try again.")
            self.load(project)
        }
    }

    func finishRestoreDiscarded(_ project: String, error: String?) {
        clearTimeout("restoreDiscarded", project)
        restoringDiscard.remove(project)
        if let error {
            opError[project] = GitOpError(title: Self.restoreFailedTitle, message: error)
        } else {
            announce(project, "Restored the discarded changes")
        }
        load(project)
    }

    private static let restoreFailedTitle = "Couldn't restore the changes"
}

extension AppModel {
    func wireGitDiscardFiles(_ c: LpmClient) {
        c.onGitDiscardFiles = { [weak self] project, paths, undo, error in
            self?.git.finishDiscardFiles(project, paths: paths, undo: undo, error: error)
        }
    }
}

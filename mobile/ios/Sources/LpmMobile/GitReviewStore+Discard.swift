import Foundation

/// Discard all changes, and its Undo: the Mac keeps a copy for 7 days and names
/// it in the reply, so the notice can offer to put it back. A Mac that keeps no
/// copy (nothing to keep, or an older Mac) gets no Undo.
extension GitReviewStore {
    func discardAll(_ project: String) {
        guard !discarding.contains(project) else { return }
        discarding.insert(project)
        opError[project] = nil
        model?.client?.gitDiscardAll(project: project)
        armTimeout("discard", project, seconds: 60) { [weak self] in
            guard let self, self.discarding.remove(project) != nil else { return }
            self.opError[project] = GitOpError(title: "Couldn't discard changes", message: "Discarding changes timed out. Try again.")
        }
    }

    func finishDiscard(_ project: String, undo: String?, error: String?) {
        clearTimeout("discard", project)
        discarding.remove(project)
        if let error {
            opError[project] = GitOpError(title: "Couldn't discard changes", message: error)
            return
        }
        if let undo { announce(project, "Discarded all changes", discardedCopy: undo) }
        load(project)
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

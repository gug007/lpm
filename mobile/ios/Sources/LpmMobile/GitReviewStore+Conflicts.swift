import Foundation

/// The merge-conflicts panel's actions on a project's merge, pull or rebase that
/// stopped on conflicts. An AI run on them belongs to the Mac: it goes on while the
/// phone is locked, and every step of it comes as a `gitMergeRun`.
extension GitReviewStore {
    var canResolveConflicts: Bool {
        model?.client?.hostFeatures.contains(LpmClient.gitConflictsFeature) == true
    }

    func runConflictOp(_ project: String, _ op: GitConflictOp) {
        guard let model, conflictOps[project] == nil else { return }
        guard !model.macAway else {
            opError[project] = GitOpError(title: op.failure, message: MacRequestError.disconnected.localizedDescription)
            return
        }
        conflictOps[project] = op
        opError[project] = nil
        model.client?.gitConflict(project: project, op)
        armTimeout("conflicts", project, seconds: op.seconds) { [weak self] in
            self?.finishConflictOp(project, op.verb, error: "It took too long. Check your Mac and try again.")
        }
    }

    func finishConflictOp(_ project: String, _ verb: String, error: String?) {
        // A late reply still changed what there is to show.
        guard let op = conflictOps[project], op.verb == verb else { return refreshWatched(project) }
        clearTimeout("conflicts", project)
        conflictOps[project] = nil
        if let error {
            opError[project] = GitOpError(title: op.failure, message: error)
        } else {
            conflictOpLanded(project, op)
        }
        refreshWatched(project)
    }

    private func conflictOpLanded(_ project: String, _ op: GitConflictOp) {
        switch op {
        case .take(let path, let side):
            Haptics.tap()
            conflictSides[project, default: [:]][path] = side
        case .commit(let source):
            let branch = snapshots[project]?.branch ?? ""
            announce(project, source.isEmpty ? "Merge committed" : "Merged \(source) into \(branch)")
            model?.noteWin()
        case .abort:
            announce(project, "Merge aborted")
        case .markResolved, .resolve, .stop:
            Haptics.tap()
        }
    }

    /// A step of an AI run. Only the phone showing the project hears how it ended:
    /// the Mac tells every phone.
    func applyMergeRun(_ run: GitMergeRun) {
        if run.running {
            resolvingConflicts[run.project] = run.line
            return
        }
        resolvingConflicts[run.project] = nil
        guard watching.contains(run.project) else { return }
        refreshWatched(run.project)
        if let error = run.error {
            opError[run.project] = GitOpError(title: GitConflictOp.resolve.failure, message: error)
        } else if let left = run.left, left > 0 {
            opError[run.project] = GitOpError(
                title: "Some conflicts are left",
                message: "\(left) file\(left == 1 ? "" : "s") still \(left == 1 ? "has" : "have") conflicts.")
        } else if run.left == 0 {
            announce(run.project, run.merging ? "Conflicts resolved. Continue the merge." : "Conflicts resolved")
        }
    }

    /// A snapshot says whether a run still goes on, for a phone that missed its end.
    func applyMerge(_ project: String, _ merge: GitMergeState?) {
        if let line = merge?.resolving {
            if resolvingConflicts[project] == nil || !line.isEmpty { resolvingConflicts[project] = line }
        } else {
            resolvingConflicts[project] = nil
        }
        if merge == nil { conflictSides[project] = nil }
    }

    /// The socket was replaced: a reply on its way went with it, and a run may have ended.
    func handleConnectionReset() {
        for project in Array(conflictOps.keys) {
            clearTimeout("conflicts", project)
            conflictOps[project] = nil
        }
        for project in resolvingConflicts.keys { refreshWatched(project) }
    }
}

extension AppModel {
    func wireGitConflicts(_ c: LpmClient) {
        c.onGitConflict = { [weak self] project, verb, error in
            self?.git.finishConflictOp(project, verb, error: error)
        }
        c.onGitMergeRun = { [weak self] run in self?.git.applyMergeRun(run) }
    }
}

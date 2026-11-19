import Foundation

/// A commit the look for secrets holds until the Mac answers.
struct PendingCommit {
    let message: String
    let files: [String]
    let push: Bool
}

/// The desktop commit dialog's secret check (useSecretCheck), for the commit
/// sheet: the files going in are scanned first, and anything found holds the
/// commit until each file is left out, a line ignored, or the commit sent anyway.
/// A Mac that can't scan, or a scan that fails, never stops a commit.
extension GitExtrasStore {
    var canScanSecrets: Bool { has(LpmClient.gitScanSecretsFeature) }

    func commit(_ project: String, message: String, files: [String], push: Bool) {
        let pending = PendingCommit(message: message, files: files, push: push)
        guard canScanSecrets else { return run(project, pending) }
        findings[project] = nil
        pendingCommits[project] = pending
        scanning.insert(project)
        client?.scanSecrets(project: project, files: files)
        timeout.arm("scan\u{0}" + project, seconds: 45) { [weak self] in
            guard let self, self.scanning.remove(project) != nil,
                  let pending = self.pendingCommits.removeValue(forKey: project) else { return }
            self.run(project, pending)
        }
    }

    func applyScan(_ reply: SecretScanReply) {
        let project = reply.project
        timeout.cancel("scan\u{0}" + project)
        guard scanning.remove(project) != nil, let pending = pendingCommits[project] else { return }
        let ignored = ignoredFindings[project] ?? []
        let open = reply.findings.filter { pending.files.contains($0.path) && !ignored.contains($0.id) }
        if open.isEmpty {
            pendingCommits[project] = nil
            run(project, pending)
        } else {
            Haptics.warning()
            findings[project] = open
        }
    }

    /// The files the findings are in, which "Leave Out and Commit" takes out.
    func flaggedFiles(_ project: String) -> [String] {
        var paths: [String] = []
        for f in findings[project] ?? [] where !paths.contains(f.path) { paths.append(f.path) }
        return paths
    }

    /// The commit that waits, if it pushes, for the buttons' wording.
    func pendingPushes(_ project: String) -> Bool { pendingCommits[project]?.push ?? false }

    /// Files the waiting commit keeps once the flagged ones are left out.
    func cleanFiles(_ project: String) -> [String] {
        let flagged = Set(flaggedFiles(project))
        return (pendingCommits[project]?.files ?? []).filter { !flagged.contains($0) }
    }

    func ignore(_ project: String, _ finding: SecretFinding) {
        ignoredFindings[project, default: []].insert(finding.id)
        findings[project]?.removeAll { $0.id == finding.id }
        clearIfDone(project)
    }

    /// One file out of the commit; the sheet drops it from the selection too.
    /// Once nothing is in the way, the next Commit looks again.
    func leaveOut(_ project: String, path: String) {
        findings[project]?.removeAll { $0.path == path }
        clearIfDone(project)
    }

    /// The flagged files out, the rest committed as asked.
    func leaveOutAndCommit(_ project: String) {
        let files = cleanFiles(project)
        findings[project] = nil
        guard let pending = pendingCommits.removeValue(forKey: project), !files.isEmpty else { return }
        run(project, PendingCommit(message: pending.message, files: files, push: pending.push))
    }

    func commitAnyway(_ project: String) {
        findings[project] = nil
        guard let pending = pendingCommits.removeValue(forKey: project) else { return }
        run(project, pending)
    }

    /// Back to the commit as it was, nothing sent.
    func dismissFindings(_ project: String) {
        findings[project] = nil
        pendingCommits[project] = nil
    }

    /// The commit sheet closed: what was waved through is forgotten, as the
    /// desktop forgets it with its dialog.
    func forgetSecrets(_ project: String) {
        dismissFindings(project)
        ignoredFindings[project] = nil
    }

    private func clearIfDone(_ project: String) {
        guard findings[project]?.isEmpty == true else { return }
        dismissFindings(project)
    }

    private func run(_ project: String, _ pending: PendingCommit) {
        guard let git = model?.git else { return }
        if pending.push {
            git.commitAndPush(project, message: pending.message, files: pending.files)
        } else {
            git.commit(project, message: pending.message, files: pending.files)
        }
    }
}

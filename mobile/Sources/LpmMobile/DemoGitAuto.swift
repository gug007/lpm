import Foundation

extension DemoWorld {
    struct GitAutoRun {
        struct Step {
            var id: String
            var status = "pending"
            var detail = ""
        }

        var runId: Int
        var nonce: String
        var kind: String
        var phase = "running"
        var canceling = false
        var steps: [Step]
        var error = ""
        var message = ""
        var url = ""
        var title = ""
        var branch = ""
        var base = ""

        var payload: [String: Any] {
            var d: [String: Any] = [
                "runId": runId, "nonce": nonce, "kind": kind, "phase": phase, "canceling": canceling,
                "rebased": false,
                "steps": steps.map { s -> [String: Any] in
                    var step: [String: Any] = ["id": s.id, "status": s.status]
                    if !s.detail.isEmpty { step["detail"] = s.detail }
                    return step
                },
            ]
            for (k, v) in [("error", error), ("message", message), ("url", url),
                           ("title", title), ("branch", branch), ("base", base)] where !v.isEmpty {
                d[k] = v
            }
            return d
        }

        mutating func set(_ id: String, _ status: String, _ detail: String = "") {
            guard let i = steps.firstIndex(where: { $0.id == id }) else { return }
            steps[i].status = status
            steps[i].detail = detail
        }
    }
}

/// Demo handlers for Auto Commit / Auto Commit and Push / Auto Create PR: the
/// Mac's step-by-step run, played out on timers against the demo repo, with
/// Stop honored between beats the way the Mac honors it between steps.
extension DemoServer {
    func registerGitAutoHandlers() {
        register("gitAuto") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            self.demoStartGitAuto(project, kind: o["kind"] as? String ?? "", nonce: o["nonce"] as? String ?? "")
        }
        register("gitAutoState") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            self.push(self.gitAutoFrame(project))
        }
        register("gitAutoCancel") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  self.world.gitAutoRuns[project]?.phase == "running" else { return }
            self.world.gitAutoRuns[project]?.canceling = true
            self.push(self.gitAutoFrame(project))
        }
        register("gitAutoSwitchBase") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let base = o["base"] as? String else { return }
            self.pushAfter(0.8) { [weak self] in
                guard let self, var repo = self.world.git[project] else { return nil }
                repo.aheadByBranch[repo.branch] = repo.ahead
                repo.branch = base
                repo.ahead = repo.aheadByBranch[base] ?? 0
                repo.behind = 0
                repo.hasUpstream = true
                self.world.git[project] = repo
                self.pushGitChanged(project)
                return ["t": "gitAutoSwitchBase", "project": project, "ok": true, "base": base]
            }
        }
    }

    private func gitAutoFrame(_ project: String) -> [String: Any] {
        var frame: [String: Any] = ["t": "gitAuto", "project": project, "ok": true]
        frame["run"] = world.gitAutoRuns[project]?.payload ?? NSNull()
        return frame
    }

    private func demoStartGitAuto(_ project: String, kind: String, nonce: String) {
        if world.gitAutoRuns[project]?.phase == "running" {
            push(gitAutoFrame(project))
            return
        }
        guard let repo = world.git[project] else {
            push(["t": "gitAuto", "project": project, "ok": false, "error": "Not a git repository."])
            return
        }
        let ids: [String]
        switch kind {
        case "commit": ids = ["commit"]
        case "commitPush": ids = ["commit", "push"]
        case "pr": ids = ["branch", "commit", "push", "pr"]
        default:
            push(["t": "gitAuto", "project": project, "ok": false, "error": "Unknown action."])
            return
        }
        let runId = world.gitAutoNextId
        world.gitAutoNextId += 1
        world.gitAutoRuns[project] = DemoWorld.GitAutoRun(
            runId: runId, nonce: nonce, kind: kind, steps: ids.map { DemoWorld.GitAutoRun.Step(id: $0) })
        push(gitAutoFrame(project))

        let beats = kind == "pr" ? prBeats(project, repo: repo) : commitBeats(project, push: kind == "commitPush")
        playGitAuto(project, runId: runId, beats: beats[...])
    }

    private typealias Beat = (delay: Double, apply: (inout DemoWorld.GitAutoRun) -> Void)

    /// Apply each beat after its delay, pushing the new state, until the run is
    /// stopped or out of beats; a run that got through every beat is done.
    private func playGitAuto(_ project: String, runId: Int, beats: ArraySlice<Beat>) {
        guard let beat = beats.first else {
            world.gitAutoRuns[project]?.phase = "done"
            push(gitAutoFrame(project))
            return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + beat.delay) { [weak self] in
            guard let self, var run = self.world.gitAutoRuns[project],
                  run.runId == runId, run.phase == "running" else { return }
            if run.canceling {
                run.phase = "canceled"
                run.canceling = false
                for i in run.steps.indices where run.steps[i].status == "running" {
                    run.steps[i].status = "pending"
                    run.steps[i].detail = ""
                }
            } else {
                beat.apply(&run)
            }
            self.world.gitAutoRuns[project] = run
            self.push(self.gitAutoFrame(project))
            if run.phase == "running" {
                self.playGitAuto(project, runId: runId, beats: beats.dropFirst())
            }
        }
    }

    private func commitBeats(_ project: String, push: Bool) -> [Beat] {
        var beats: [Beat] = [
            (0.2, { run in run.set("commit", "running", "Writing the commit message…") }),
            (1.8, { run in run.set("commit", "running", "Committing…") }),
            (0.5, { [weak self] run in
                guard let self else { return }
                guard let message = self.demoCommitAll(project) else {
                    run.set("commit", "failed")
                    run.phase = "failed"
                    run.error = "No changes to commit."
                    return
                }
                run.set("commit", "done", message)
                run.message = message
            }),
        ]
        if push {
            let branch = world.git[project]?.branch ?? ""
            beats += [
                (0.2, { run in run.set("push", "running", "Pushing \(branch)…") }),
                (1.2, { [weak self] run in
                    self?.demoPushed(project)
                    run.set("push", "done", "origin/\(branch)")
                }),
            ]
        }
        return beats
    }

    private func prBeats(_ project: String, repo: DemoWorld.GitRepo) -> [Beat] {
        let needsBranch = repo.detached || repo.branch == repo.defaultBranch
        let hasChanges = !repo.files.isEmpty
        let needsPush = needsBranch || hasChanges || !repo.hasUpstream || repo.ahead > 0
        if needsBranch && !hasChanges {
            return [(0.3, { run in
                run.phase = "failed"
                run.error = "Nothing to open a pull request for: no changes on \(repo.defaultBranch)."
            })]
        }
        let draft = demoPrDraft(repo)
        let branch = needsBranch ? "feat/" + demoSlug(draft.title) : repo.branch
        var beats: [Beat] = [(0.2, { run in
            if !needsBranch { run.set("branch", "skipped", "Already on \(repo.branch)") }
            if !hasChanges { run.set("commit", "skipped", "No uncommitted changes") }
            if !needsPush { run.set("push", "skipped", "Already pushed") }
        })]
        if needsBranch {
            beats += [
                (0.2, { run in run.set("branch", "running", "Naming the branch…") }),
                (1.5, { run in run.set("branch", "running", "Creating \(branch)…") }),
                (0.4, { [weak self] run in
                    self?.demoCreateBranch(project, branch)
                    run.set("branch", "done", branch)
                    run.branch = branch
                }),
            ]
        }
        if hasChanges {
            beats += [
                (0.2, { run in run.set("commit", "running", "Writing the commit message…") }),
                (1.6, { run in run.set("commit", "running", "Committing…") }),
                (0.5, { [weak self] run in
                    run.set("commit", "done", self?.demoCommitAll(project) ?? "")
                }),
            ]
        }
        if needsPush {
            beats += [
                (0.2, { run in run.set("push", "running", "Pushing \(branch)…") }),
                (1.2, { [weak self] run in
                    self?.demoPushed(project)
                    run.set("push", "done", "origin/\(branch)")
                }),
            ]
        }
        beats += [
            (0.2, { run in run.set("pr", "running", "Writing the title and description…") }),
            (2.0, { run in run.set("pr", "running", "Opening the pull request…") }),
            (1.0, { run in
                run.set("pr", "done", draft.title)
                run.url = "https://github.com/demo/storefront/pull/42"
                run.title = draft.title
                run.branch = branch
                run.base = repo.defaultBranch
            }),
        ]
        return beats
    }

    /// Commit every changed file; the message, or nil with nothing to commit.
    private func demoCommitAll(_ project: String) -> String? {
        guard var repo = world.git[project], !repo.files.isEmpty else { return nil }
        let message = demoCommitMessage(repo.files.map(\.path))
        repo.files = []
        repo.ahead += 1
        world.git[project] = repo
        pushGitChanged(project)
        return message
    }

    private func demoPushed(_ project: String) {
        guard var repo = world.git[project] else { return }
        repo.ahead = 0
        repo.hasUpstream = true
        repo.aheadByBranch[repo.branch] = 0
        world.git[project] = repo
    }

    private func demoCreateBranch(_ project: String, _ name: String) {
        guard var repo = world.git[project] else { return }
        repo.aheadByBranch[repo.branch] = repo.ahead
        repo.branches.insert(DemoWorld.GitBranch(name: name, committerDate: isoNow()), at: 0)
        repo.branch = name
        repo.detached = false
        repo.ahead = 0
        repo.hasUpstream = false
        world.git[project] = repo
    }

    private func demoSlug(_ s: String) -> String {
        s.lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
            .joined(separator: "-")
    }
}

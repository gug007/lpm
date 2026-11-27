import Foundation

/// Demo CI: storefront's open pull request with one failing test, api-gateway's
/// main passing, the rest without CI. Running the failed jobs again shows them
/// running for a few seconds, then passing, and the pull request ready to merge;
/// merging it leaves storefront without CI. Merge When Checks Pass, armed while
/// they run, merges it 4 seconds after they pass. Keep fixing until green plays two
/// rounds over 28 seconds and ends with the checks passing. Mirrored in the
/// Android demo.
extension DemoServer {
    private static let rerunSeconds: TimeInterval = 6
    /// How long an armed Merge When Checks Pass waits after the checks pass, as the
    /// Mac's next look at GitHub would.
    private static let armedMergeSeconds: TimeInterval = 4

    func registerGitChecksHandlers() {
        register("gitChecks") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            self.pushAfter(0.3) { [weak self] in
                guard let self else { return nil }
                return self.demoChecksReply(project)
            }
        }
        register("gitChecksRerun") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            self.world.ciRerunAt[project] = Date()
            self.pushAfter(0.4) { ["t": "gitChecksRerun", "project": project, "ok": true] }
        }
        register("ciFixLoop") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            if o["on"] as? Bool == true {
                self.startDemoFixLoop(project, agent: o["agent"] as? String ?? "")
            } else {
                self.world.ciFixLoops[project]?.cancelledAt = Date()
                self.push(["t": "ciFixLoop", "project": project, "ok": true,
                           "loop": self.demoFixLoop(project).map { $0 as Any } ?? NSNull()])
            }
        }
        register("gitMergePrWhenReady") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            let watch: [String: Any] = ["path": "", "number": o["number"] as? Int ?? 0,
                                        "title": o["title"] as? String ?? "", "method": o["method"] as? String ?? "squash",
                                        "deleteBranch": o["deleteBranch"] as? Bool ?? false,
                                        "bypass": o["bypass"] as? Bool ?? false, "state": "waiting",
                                        "deletedBranch": false]
            self.world.ciMergeWatch[project] = watch
            self.push(["t": "gitMergePrWhenReady", "project": project, "ok": true])
            self.push(["t": "gitMergeWatch", "project": project, "watch": watch])
            let left = self.world.ciRerunAt[project].map { Self.rerunSeconds - Date().timeIntervalSince($0) } ?? 0
            self.pushAfter(max(left, 0) + Self.armedMergeSeconds) { [weak self] in
                guard let self, var armed = self.world.ciMergeWatch.removeValue(forKey: project) else { return nil }
                self.world.ciMerged.insert(project)
                armed["state"] = "merged"
                armed["deletedBranch"] = armed["deleteBranch"] ?? false
                return ["t": "gitMergeWatch", "project": project, "watch": armed]
            }
        }
        register("gitMergePrCancel") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            if var armed = self.world.ciMergeWatch.removeValue(forKey: project) {
                armed["state"] = "cancelled"
                self.push(["t": "gitMergeWatch", "project": project, "watch": armed])
            }
            self.push(["t": "gitMergePrCancel", "project": project, "ok": true])
        }
        register("gitMergePr") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            let number = o["number"] as? Int ?? 0
            let deleteBranch = o["deleteBranch"] as? Bool ?? false
            self.pushAfter(1.2) { [weak self] in
                self?.world.ciMerged.insert(project)
                return ["t": "gitMergePr", "project": project, "ok": true, "number": number,
                        "deletedBranch": deleteBranch]
            }
        }
    }

    private func startDemoFixLoop(_ project: String, agent: String) {
        let id = world.ciFixLoopNextId
        world.ciFixLoopNextId += 1
        world.ciFixLoops[project] = DemoFixLoop(id: id, agent: agent.isEmpty ? "The agent" : agent, startedAt: Date())
        for (index, step) in DemoFixLoop.steps.enumerated() {
            pushAfter(index == 0 ? 0.2 : step.at + 0.05) { [weak self] in
                guard let self, let run = self.world.ciFixLoops[project], run.id == id, run.cancelledAt == nil,
                      let loop = self.demoFixLoop(project) else { return nil }
                return ["t": "ciFixLoop", "project": project, "ok": true, "loop": loop]
            }
        }
    }

    /// The project's loop as the Mac would say it now, or nil with none.
    private func demoFixLoop(_ project: String) -> [String: Any]? {
        guard let run = world.ciFixLoops[project] else { return nil }
        let step = run.step(at: Date())
        var loop: [String: Any] = ["project": project, "agent": run.agent, "branch": world.git[project]?.branch ?? "",
                                   "round": step.round, "maxRounds": 3, "state": step.state, "sha": step.sha,
                                   "progress": step.progress]
        switch step.state {
        case "starting": loop["detail"] = "Opening the \(run.agent) tab…"
        case "fixing": loop["detail"] = "\(run.agent) is fixing \(step.sha)"
        case "watching": loop["detail"] = "\(run.agent) pushed \(step.sha) · watching the new run"
        case "passed": loop["detail"] = "CI passed after 2 rounds"
        default: loop["detail"] = "Stopped"
        }
        return loop
    }

    private func demoChecksReply(_ project: String) -> [String: Any] {
        var reply: [String: Any] = ["t": "gitChecks", "project": project, "ok": true,
                                    "branch": world.git[project]?.branch ?? "", "pr": NSNull(), "commit": NSNull()]
        switch project {
        case "storefront" where !world.ciMerged.contains(project):
            let rerun = world.ciRerunAt[project].map { Date().timeIntervalSince($0) }
            let loop = world.ciFixLoops[project].map { $0.step(at: Date()).state }
            let testState = loop == "passed" ? "pass" : loop == "watching" ? "pending"
                : rerun.map { $0 < Self.rerunSeconds ? "pending" : "pass" } ?? "fail"
            let checks: [[String: Any]] = [
                ["name": "test (ubuntu-latest)", "workflow": "CI", "state": testState,
                 "url": "https://github.com/example/storefront/actions/runs/7001/job/1"],
                ["name": "lint", "workflow": "CI", "state": "pass",
                 "url": "https://github.com/example/storefront/actions/runs/7001/job/2"],
                ["name": "build", "workflow": "CI", "state": "pass",
                 "url": "https://github.com/example/storefront/actions/runs/7001/job/3"],
                ["name": "Vercel", "workflow": "", "state": "pass", "url": "https://vercel.com/example/storefront"],
            ]
            reply["pr"] = ["number": 42, "url": "https://github.com/example/storefront/pull/42",
                           "title": "Two-step checkout flow", "isDraft": false, "checks": checks,
                           "merge": ["mergeable": "MERGEABLE", "state": testState == "pass" ? "CLEAN" : "UNSTABLE",
                                     "review": "APPROVED", "head": "4b8e2f1c9d0a7e3b5f6c8d2a1e0b9c7f3d5a6e84",
                                     "methods": ["merge", "squash", "rebase"], "deletesBranch": false]]
            if testState == "fail" {
                reply["fixPrompt"] = """
                CI checks are failing on pull request #42 (https://github.com/example/storefront/pull/42):
                - test (ubuntu-latest) — https://github.com/example/storefront/actions/runs/7001/job/1

                Find out why with `gh pr checks 42` and `gh run view 7001 --log-failed`, fix the cause, and run the same checks locally where you can to confirm the fix.
                """
                reply["fixLoopPrompt"] = (reply["fixPrompt"] as? String ?? "") + "\n\nWhen it's fixed, commit and push. lpm is watching CI on this branch and will send you any check that still fails (round 1 of 3)."
            }
        case "api-gateway":
            reply["commit"] = [
                "sha": "9e7d031b4c2a8f6e1d0c3b5a7f9e2d4c6b8a0f13", "title": "Rate limit the token endpoint",
                "url": "https://github.com/example/api-gateway/commit/9e7d031b4c2a8f6e1d0c3b5a7f9e2d4c6b8a0f13",
                "checks": [
                    ["name": "test", "workflow": "CI", "state": "pass",
                     "url": "https://github.com/example/api-gateway/actions/runs/8120/job/1"],
                    ["name": "deploy-preview", "workflow": "Deploy", "state": "pass",
                     "url": "https://github.com/example/api-gateway/actions/runs/8121/job/1", "commit": "4f1c2ab"],
                ],
            ]
        default:
            break
        }
        if let loop = demoFixLoop(project) { reply["fixLoop"] = loop }
        if let watch = world.ciMergeWatch[project] { reply["mergeWatch"] = watch }
        return reply
    }
}

/// A demo Keep fixing until green run: two rounds, then green.
struct DemoFixLoop {
    struct Step {
        let at: TimeInterval
        let state: String
        let round: Int
        let sha: String
        let progress: Double
    }

    static let steps: [Step] = [
        Step(at: 0, state: "starting", round: 1, sha: "4b8e2f1", progress: 0),
        Step(at: 2, state: "fixing", round: 1, sha: "4b8e2f1", progress: 1.0 / 9),
        Step(at: 9, state: "watching", round: 1, sha: "7c41e2a", progress: 2.0 / 9),
        Step(at: 18, state: "fixing", round: 2, sha: "7c41e2a", progress: 4.0 / 9),
        Step(at: 22, state: "watching", round: 2, sha: "9a3d0be", progress: 5.0 / 9),
        Step(at: 28, state: "passed", round: 2, sha: "9a3d0be", progress: 1),
    ]

    let id: Int
    let agent: String
    let startedAt: Date
    var cancelledAt: Date?

    func step(at now: Date) -> Step {
        let elapsed = (cancelledAt ?? now).timeIntervalSince(startedAt)
        let reached = Self.steps.last { $0.at <= elapsed } ?? Self.steps[0]
        guard cancelledAt != nil, reached.state != "passed" else { return reached }
        return Step(at: elapsed, state: "cancelled", round: reached.round, sha: reached.sha, progress: 1)
    }
}

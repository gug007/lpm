import Foundation

/// Demo CI: storefront's open pull request with one failing test, api-gateway's
/// main passing, the rest without CI. Running the failed jobs again shows them
/// running for a few seconds, then passing, and the pull request ready to merge;
/// merging it leaves storefront without CI. Mirrored in the Android demo.
extension DemoServer {
    private static let rerunSeconds: TimeInterval = 6

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

    private func demoChecksReply(_ project: String) -> [String: Any] {
        var reply: [String: Any] = ["t": "gitChecks", "project": project, "ok": true,
                                    "branch": world.git[project]?.branch ?? "", "pr": NSNull(), "commit": NSNull()]
        switch project {
        case "storefront" where !world.ciMerged.contains(project):
            let rerun = world.ciRerunAt[project].map { Date().timeIntervalSince($0) }
            let testState = rerun.map { $0 < Self.rerunSeconds ? "pending" : "pass" } ?? "fail"
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
        return reply
    }
}

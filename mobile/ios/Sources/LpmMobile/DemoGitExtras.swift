import Foundation

/// Demo answers for the review's extras: a clean look for secrets, storefront's
/// branch with the two commits it made since main, the review on its pull
/// request, the failing test's log, and saving an edit into the demo's files.
/// Mirrored in the Android demo.
extension DemoServer {
    private static let reviewUrl = "https://github.com/example/storefront/pull/42"
    private static let testJobUrl = "https://github.com/example/storefront/actions/runs/7001/job/1"

    func registerGitExtrasHandlers() {
        register("gitScanSecrets") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            self.pushAfter(0.6, ["t": "gitScanSecrets", "project": project, "ok": true, "findings": [] as [Any]])
        }
        register("gitBranchFiles") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            self.pushAfter(0.3) { [weak self] in self?.demoBranchFiles(project) }
        }
        register("gitBranchDiffs") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            let paths = o["paths"] as? [String] ?? []
            self.pushAfter(0.2) { [weak self] in
                guard let self else { return nil }
                let files = self.demoBranchCommits(project).files
                let entries = paths.map { path -> [String: Any] in
                    guard let file = files.first(where: { $0.path == path }) else {
                        return ["path": path, "error": "\(path) isn't on this branch."]
                    }
                    return ["path": path, "diff": Self.demoPatch(file), "binary": false, "truncated": false]
                }
                return ["t": "gitBranchDiffs", "project": project, "ok": true, "files": entries]
            }
        }
        register("gitPrDiscussion") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            let open = project == "storefront" && !self.world.ciMerged.contains(project)
            var reply: [String: Any] = ["t": "gitPrDiscussion", "project": project, "ok": true,
                                        "discussion": NSNull()]
            if open {
                reply["discussion"] = Self.demoDiscussion
                reply["prompt"] = Self.demoReviewPrompt
            }
            self.pushAfter(0.4, reply)
        }
        register("gitCheckLog") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            let url = o["url"] as? String ?? ""
            var reply: [String: Any] = ["t": "gitCheckLog", "project": project, "url": url]
            if url == Self.testJobUrl {
                reply["ok"] = true
                reply["step"] = "Run tests"
                reply["lines"] = Self.demoTestLog
                reply["more"] = false
            } else {
                reply["ok"] = false
                reply["error"] = "This check's log isn't on GitHub Actions. Open it to see what failed."
            }
            self.pushAfter(0.5, reply)
        }
        register("writeFile") { [weak self] o in
            guard let self, let project = o["project"] as? String, let path = o["path"] as? String else { return }
            let content = o["content"] as? String ?? ""
            let current = Data(self.demoFileContent(project: project, path: path).utf8)
            var reply: [String: Any] = ["t": "writeFile", "project": project, "path": path,
                                        "reqId": o["reqId"] ?? NSNull()]
            if FileEditScreen.sha256(current) == o["base"] as? String {
                self.world.fileEdits[project + "\n" + path] = content
                let saved = Data(content.utf8)
                reply["ok"] = true
                reply["size"] = saved.count
                reply["mtime"] = 2
                reply["sha256"] = FileEditScreen.sha256(saved)
            } else {
                reply["ok"] = false
                reply["changed"] = true
                reply["error"] = "\((path as NSString).lastPathComponent) changed on your Mac since you opened it. Open it again to see the new version."
            }
            self.pushAfter(0.3, reply)
        }
    }

    /// The commits a project's branch made on its own, and the files they changed:
    /// storefront's feature branch since main, any other branch's unpushed ones.
    private func demoBranchCommits(_ project: String) -> (base: String, range: String, commits: Int,
                                                          files: [DemoCommitFile]) {
        guard let repo = world.git[project] else { return ("", "", 0, []) }
        let since = repo.branch != repo.defaultBranch
        let log = project == "storefront" ? Self.storefrontLog : Self.otherLog
        let count = since ? (repo.branch == "feat/checkout-redesign" ? 2 : 0) : repo.ahead
        guard since || repo.hasUpstream else { return ("", "", 0, []) }
        var files: [DemoCommitFile] = []
        for commit in log.prefix(count).reversed() {
            for file in commit.files {
                files.removeAll { $0.path == file.path }
                files.append(file)
            }
        }
        files.sort { $0.path < $1.path }
        return (since ? repo.defaultBranch : "origin/\(repo.branch)", since ? "since" : "unpushed", count, files)
    }

    private func demoBranchFiles(_ project: String) -> [String: Any] {
        let branch = demoBranchCommits(project)
        return ["t": "gitBranchFiles", "project": project, "ok": true, "base": branch.base,
                "range": branch.range, "commits": branch.commits,
                "files": branch.files.map { ["path": $0.path, "status": $0.status, "staged": false] }]
    }

    private static let demoNotes: [[String: Any]] = [
        ["kind": "review", "author": "samlee", "body": "A couple of things before this goes in.",
         "state": "COMMENTED", "path": "", "line": NSNull(), "createdAt": "2026-11-18T09:12:00Z"],
        ["kind": "line", "author": "samlee",
         "body": "Disable the button while the payment intent is being created, or a double tap charges twice.",
         "state": "", "path": "components/CheckoutForm.tsx", "line": 42, "createdAt": "2026-11-18T09:12:01Z"],
        ["kind": "line", "author": "samlee", "body": "This swallows the error. Return it so the form can show it.",
         "state": "", "path": "lib/payments.ts", "line": 18, "createdAt": "2026-11-18T09:12:02Z"],
        ["kind": "comment", "author": "priyan", "body": "Can the old one-page flow stay behind a flag for a week?",
         "state": "", "path": "", "line": NSNull(), "createdAt": "2026-11-18T10:40:00Z"],
        ["kind": "review", "author": "samlee", "body": "", "state": "APPROVED", "path": "", "line": NSNull(),
         "createdAt": "2026-11-18T11:05:00Z"],
    ]

    private static let demoDiscussion: [String: Any] = [
        "number": 42, "title": "Two-step checkout flow", "url": reviewUrl,
        "body": "Splits checkout into an address step and a payment step.", "notes": demoNotes,
    ]

    private static let demoReviewPrompt = """
    Address the review on pull request #42 (\(reviewUrl)).

    Pull request #42:
    ```
    #42 Two-step checkout flow
    \(reviewUrl)

    Splits checkout into an address step and a payment step.

    Discussion:
    - samlee commented: A couple of things before this goes in.
    - samlee on components/CheckoutForm.tsx:42: Disable the button while the payment intent is being created, or a double tap charges twice.
    - samlee on lib/payments.ts:18: This swallows the error. Return it so the form can show it.
    - priyan: Can the old one-page flow stay behind a flag for a week?
    - samlee approved
    ```

    Make the changes the reviewers asked for, run the tests, then commit and push.
    """

    private static let demoTestLog = [
        "> storefront@0.1.0 test",
        "> vitest run",
        "",
        " ✓ lib/payments.test.ts (12 tests) 271ms",
        " ✗ components/CheckoutForm.test.tsx (8 tests | 1 failed) 460ms",
        "   → expected discount total to equal 41.98, got 45.98",
        " ✓ app/checkout/page.test.tsx (5 tests) 655ms",
        "",
        " FAIL  components/CheckoutForm.test.tsx > applies the discount at the payment step",
        "AssertionError: expected 45.98 to be 41.98",
        " ❯ components/CheckoutForm.test.tsx:64:31",
        "",
        " Test Files  1 failed | 2 passed (3)",
        "      Tests  1 failed | 24 passed (25)",
        "   Duration  7.2s",
        "Error: Process completed with exit code 1.",
    ]
}

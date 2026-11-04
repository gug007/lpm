import Foundation

/// Demo handlers for commit history: a fixed log per project, its newest
/// `ahead` commits not pushed yet, with each commit's files and their patches
/// made up from the line counts.
extension DemoServer {
    struct DemoCommitFile {
        let path: String
        let status: String
        let added: Int?
        let removed: Int?
        var oldPath: String? = nil
    }

    struct DemoCommit {
        let hash: String
        let subject: String
        let body: String
        let author: String
        let email: String
        let minutesAgo: Int
        let parents: Int
        let coAuthors: [String]
        let files: [DemoCommitFile]
    }

    private static let claude = "Claude Opus 5.5 <noreply@anthropic.com>"
    private static let codex = "Codex <noreply@openai.com>"

    private static let storefrontLog: [DemoCommit] = [
        DemoCommit(hash: "a1f3c9e5b2d84f6a9c0e1b7d3f5a8c2e4b6d9f01", subject: "Two-step checkout flow",
                   body: "Split the form into address and payment steps.\n\nCo-authored-by: \(claude)",
                   author: "Alex Kim", email: "alex@example.com", minutesAgo: 12, parents: 1,
                   coAuthors: [claude],
                   files: [DemoCommitFile(path: "components/CheckoutForm.tsx", status: "modified", added: 38, removed: 5),
                           DemoCommitFile(path: "components/StepIndicator.tsx", status: "added", added: 14, removed: 0)]),
        DemoCommit(hash: "7b20d14c8e3f5a6b9d2c1e0f4a7b8c3d5e6f9a12", subject: "Add payment intent API",
                   body: "Co-authored-by: \(claude)",
                   author: "Alex Kim", email: "alex@example.com", minutesAgo: 125, parents: 1,
                   coAuthors: [claude],
                   files: [DemoCommitFile(path: "lib/payments.ts", status: "added", added: 72, removed: 0),
                           DemoCommitFile(path: "app/api/routes.ts", status: "modified", added: 14, removed: 0)]),
        DemoCommit(hash: "3e91a07f2b6c4d8e1a5f9b3c7d0e2f4a6b8c1d23", subject: "Merge pull request #408 from acme/fix/cart-badge",
                   body: "Fix cart badge count", author: "Alex Kim", email: "alex@example.com", minutesAgo: 300,
                   parents: 2, coAuthors: [],
                   files: [DemoCommitFile(path: "components/CartBadge.tsx", status: "modified", added: 6, removed: 2)]),
        DemoCommit(hash: "9e04bb21d7f3a5c8e6b0d4f2a1c9e7b5d3f8a634", subject: "Fix cart badge count",
                   body: "Co-authored-by: \(codex)", author: "Sam Lee", email: "sam@example.com",
                   minutesAgo: 1_500, parents: 1, coAuthors: [codex],
                   files: [DemoCommitFile(path: "components/CartBadge.tsx", status: "modified", added: 6, removed: 2)]),
        DemoCommit(hash: "51c7d3a8f0e2b4c6d9a1e3f5b7c0d2e4f6a8b945", subject: "Bump next to 15.2",
                   body: "", author: "dependabot[bot]", email: "bot@example.com", minutesAgo: 1_720, parents: 1,
                   coAuthors: [],
                   files: [DemoCommitFile(path: "package.json", status: "modified", added: 1, removed: 1),
                           DemoCommitFile(path: "package-lock.json", status: "modified", added: 11, removed: 11)]),
        DemoCommit(hash: "c02f6e84a9b1d3f5e7c0a2b4d6f8e1a3c5b7d056", subject: "Rate-limit the cart API",
                   body: "Co-authored-by: \(claude)", author: "Alex Kim", email: "alex@example.com",
                   minutesAgo: 2_900, parents: 1, coAuthors: [claude],
                   files: [DemoCommitFile(path: "lib/rateLimit.ts", status: "added", added: 41, removed: 0),
                           DemoCommitFile(path: "app/api/routes.ts", status: "modified", added: 7, removed: 4),
                           DemoCommitFile(path: "public/cart-icon.png", status: "added", added: nil, removed: nil)]),
        DemoCommit(hash: "e5a8b2c4d6f0a1b3c5d7e9f2a4b6c8d0e1f3a167", subject: "Move the cart into its own page",
                   body: "", author: "Sam Lee", email: "sam@example.com", minutesAgo: 8_700, parents: 1,
                   coAuthors: [],
                   files: [DemoCommitFile(path: "app/cart/page.tsx", status: "renamed", added: 3, removed: 1,
                                          oldPath: "app/cart.tsx")]),
        DemoCommit(hash: "0d4f6a8c1e3b5d7f9a2c4e6b8d0f1a3c5e7b9d78", subject: "Initial storefront",
                   body: "", author: "Alex Kim", email: "alex@example.com", minutesAgo: 20_160, parents: 0,
                   coAuthors: [],
                   files: [DemoCommitFile(path: "README.md", status: "added", added: 9, removed: 0),
                           DemoCommitFile(path: "package.json", status: "added", added: 18, removed: 0)]),
    ]

    private static let otherLog: [DemoCommit] = [
        DemoCommit(hash: "4f1c2ab9d3e5f7a0b2c4d6e8f1a3b5c7d9e0f289", subject: "Update dependencies",
                   body: "", author: "Alex Kim", email: "alex@example.com", minutesAgo: 1_440, parents: 1,
                   coAuthors: [],
                   files: [DemoCommitFile(path: "package.json", status: "modified", added: 3, removed: 3)]),
        DemoCommit(hash: "8a2c4e6f0b1d3f5a7c9e2b4d6f8a0c1e3b5d7f90", subject: "Initial commit",
                   body: "", author: "Alex Kim", email: "alex@example.com", minutesAgo: 10_080, parents: 0,
                   coAuthors: [],
                   files: [DemoCommitFile(path: "README.md", status: "added", added: 6, removed: 0)]),
    ]

    /// How the pushed commits of the projects with CI did, newest first.
    private static let commitCi = ["pass", "fail", "pass"]

    private func demoCommitChecks(_ project: String) -> [[String: Any]] {
        guard ["storefront", "api-gateway"].contains(project), let log = demoLog(project) else { return [] }
        let pushed = log.dropFirst(world.git[project]?.ahead ?? 0)
        return zip(pushed, Self.commitCi).map { commit, state in ["sha": commit.hash, "state": state] }
    }

    func registerGitHistoryHandlers() {
        register("gitHistory") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            let skip = o["skip"] as? Int ?? 0
            let limit = max(1, o["limit"] as? Int ?? 100)
            self.pushAfter(0.3) { [weak self] in
                guard let self else { return nil }
                guard let log = self.demoLog(project) else {
                    return ["t": "gitHistory", "project": project, "skip": skip, "ok": false,
                            "error": "Not a git repository."]
                }
                let ahead = self.world.git[project]?.ahead ?? 0
                let now = Int(Date().timeIntervalSince1970)
                let page = log.enumerated().dropFirst(skip).prefix(limit).map { index, c -> [String: Any] in
                    ["hash": c.hash, "short": String(c.hash.prefix(7)), "subject": c.subject, "body": c.body,
                     "author": c.author, "email": c.email, "time": now - c.minutesAgo * 60,
                     "parents": c.parents, "coAuthors": c.coAuthors, "unpushed": index < ahead]
                }
                return ["t": "gitHistory", "project": project, "skip": skip, "ok": true,
                        "commits": page, "hasMore": skip + page.count < log.count]
            }
        }
        register("gitCommitChecks") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            self.pushAfter(0.3) { [weak self] in
                guard let self else { return nil }
                return ["t": "gitCommitChecks", "project": project, "ok": true,
                        "commits": self.demoCommitChecks(project)]
            }
        }
        register("gitCommitFiles") { [weak self] o in
            guard let self, let project = o["project"] as? String, let hash = o["hash"] as? String else { return }
            self.pushAfter(0.2) { [weak self] in
                guard let commit = self?.demoCommit(project, hash) else {
                    return ["t": "gitCommitFiles", "project": project, "hash": hash, "ok": false,
                            "error": "\(hash) is not a commit"]
                }
                let files = commit.files.map { f -> [String: Any] in
                    ["path": f.path, "oldPath": f.oldPath ?? NSNull(), "status": f.status,
                     "added": f.added ?? NSNull(), "removed": f.removed ?? NSNull()]
                }
                return ["t": "gitCommitFiles", "project": project, "hash": hash, "ok": true, "files": files]
            }
        }
        register("gitCommitPatch") { [weak self] o in
            guard let self, let project = o["project"] as? String, let hash = o["hash"] as? String,
                  let path = o["path"] as? String else { return }
            self.pushAfter(0.2) { [weak self] in
                guard let file = self?.demoCommit(project, hash)?.files.first(where: { $0.path == path }) else {
                    return ["t": "gitCommitPatch", "project": project, "hash": hash, "path": path, "ok": false,
                            "error": "\(hash) is not a commit"]
                }
                return ["t": "gitCommitPatch", "project": project, "hash": hash, "path": path, "ok": true,
                        "diff": Self.demoPatch(file), "truncated": false]
            }
        }
    }

    private func demoLog(_ project: String) -> [DemoCommit]? {
        guard world.git[project] != nil else { return nil }
        return project == "storefront" ? Self.storefrontLog : Self.otherLog
    }

    private func demoCommit(_ project: String, _ hash: String) -> DemoCommit? {
        demoLog(project)?.first { $0.hash == hash }
    }

    /// A patch with the file's line counts: its removed lines, then its added ones.
    private static func demoPatch(_ f: DemoCommitFile) -> String {
        let from = f.status == "added" ? "/dev/null" : "a/\(f.oldPath ?? f.path)"
        let to = f.status == "deleted" ? "/dev/null" : "b/\(f.path)"
        let removed = f.removed ?? 0
        let added = f.added ?? 0
        let start = f.status == "added" ? 0 : 1
        var lines = ["diff --git a/\(f.oldPath ?? f.path) b/\(f.path)", "--- \(from)", "+++ \(to)",
                     "@@ -\(start),\(removed) +\(start == 0 ? 1 : start),\(added) @@"]
        lines += (0..<removed).map { "-" + demoLine($0, f.path, old: true) }
        lines += (0..<added).map { "+" + demoLine($0, f.path, old: false) }
        return lines.joined(separator: "\n") + "\n"
    }

    private static func demoLine(_ i: Int, _ path: String, old: Bool) -> String {
        let name = ((path as NSString).lastPathComponent as NSString).deletingPathExtension
        let code = [
            "import { useState } from \"react\";",
            "",
            "export function \(name)() {",
            "  const [step, setStep] = useState(\(old ? 0 : 1));",
            "  if (!step) return null;",
            "  return <section className=\"\(name.lowercased())\">{step}</section>;",
            "}",
        ]
        return code[i % code.count]
    }
}

import Foundation

/// Demo answers for the composer's @ menu: storefront's open issues, and one of
/// them with its comments. Mirrored in the Android demo.
extension DemoServer {
    private struct DemoIssue {
        let number: Int
        let title: String
        let author: String
        let labels: [String]
        let branch: String
        let body: String
        var comments: [(author: String, body: String)] = []

        var url: String { "https://github.com/example/storefront/issues/\(number)" }

        var row: [String: Any] {
            ["number": number, "title": title, "url": url, "author": author, "labels": labels, "branch": branch]
        }

        /// Laid out as issues.rs lays one out for the message and the prompt.
        var text: [String: Any] {
            let said = comments.map { "- \($0.author): \($0.body)" }.joined(separator: "\n")
            let thread = said.isEmpty ? body : "\(body)\n\nComments:\n\(said)"
            return ["number": number, "title": title, "url": url,
                    "mention": "Issue #\(number):\n```\n#\(number) \(title)\n\(url)\n\n\(thread)\n```\n",
                    "prompt": "Work on issue #\(number): \(title)\n\(url)\n\n\(thread)"]
        }
    }

    func registerGitIssueHandlers() {
        register("gitIssues") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            let issues = project == "storefront" ? Self.demoIssues : []
            self.pushAfter(0.4, ["t": "gitIssues", "project": project, "ok": true, "issues": issues.map(\.row)])
        }
        register("gitIssue") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            let number = o["number"] as? Int ?? 0
            var reply: [String: Any] = ["t": "gitIssue", "project": project, "number": number,
                                        "reqId": o["reqId"] ?? NSNull()]
            if project == "storefront", let issue = Self.demoIssues.first(where: { $0.number == number }) {
                reply["ok"] = true
                reply["issue"] = issue.text
            } else {
                reply["ok"] = false
                reply["error"] = "There's no issue #\(number) in this repository."
            }
            self.pushAfter(0.5, reply)
        }
    }

    private static let demoIssues = [
        DemoIssue(number: 45, title: "Cart badge keeps the old count after checkout", author: "priyan",
                  labels: ["bug"], branch: "45-cart-badge-keeps-the-old-count-after-checkout",
                  body: "Pay for an order, then go back to the shop. The badge still shows the items that were bought until the page reloads.",
                  comments: [(author: "samlee", body: "The badge reads the cart once, in components/CartBadge.tsx.")]),
        DemoIssue(number: 38, title: "Split checkout into two steps", author: "samlee",
                  labels: ["checkout"], branch: "38-split-checkout-into-two-steps",
                  body: "One long form loses people. Ask for the address first, then the payment."),
        DemoIssue(number: 31, title: "Show delivery dates on the product page", author: "priyan",
                  labels: ["feature"], branch: "31-show-delivery-dates-on-the-product-page",
                  body: "Support gets asked when an order will arrive. The product page can say it before someone buys."),
    ]
}

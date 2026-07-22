import Foundation

/// Demo handlers for git review & ship: snapshot, diffs, commit/push/pull/fetch,
/// branches, checkout, PR drafting, and watch. Mutations update the world and
/// push `git-changed` to watchers so the review screen self-refreshes. Owns the
/// cross-domain hook `demoCloneGitState`.
extension DemoServer {
    func registerGitHandlers() {
        register("git") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            self.pushAfter(0.3) { [weak self] in self?.world.gitSnapshotPayload(project) }
        }
        register("gitDiff") { [weak self] o in
            guard let self, let project = o["project"] as? String, let path = o["path"] as? String else { return }
            self.push(["t": "gitDiff", "project": project, "path": path, "ok": true,
                       "diff": self.demoDiff(project: project, path: path),
                       "binary": false, "truncated": false])
        }
        register("gitDiffs") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            let paths = o["paths"] as? [String] ?? []
            self.pushAfter(0.25) { [weak self] in
                guard let self else { return nil }
                let files: [[String: Any]] = paths.map { path in
                    ["path": path, "diff": self.demoDiff(project: project, path: path),
                     "binary": false, "truncated": false]
                }
                return ["t": "gitDiffs", "project": project, "ok": true, "files": files]
            }
        }
        register("gitCommit") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            let files = o["files"] as? [String] ?? []
            self.pushAfter(0.4) { [weak self] in
                guard let self else { return nil }
                guard var repo = self.world.git[project] else {
                    return ["t": "gitCommit", "project": project, "ok": false,
                            "error": "Not a git repository."]
                }
                repo.files.removeAll { files.contains($0.path) }
                repo.ahead += 1
                self.world.git[project] = repo
                self.pushGitChanged(project)
                return ["t": "gitCommit", "project": project, "ok": true]
            }
        }
        register("gitPush") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            self.pushAfter(1.2) { [weak self] in
                guard let self else { return nil }
                guard var repo = self.world.git[project] else {
                    return ["t": "gitPush", "project": project, "ok": false,
                            "error": "Not a git repository."]
                }
                repo.ahead = 0
                repo.hasUpstream = true
                repo.aheadByBranch[repo.branch] = 0
                self.world.git[project] = repo
                return ["t": "gitPush", "project": project, "ok": true]
            }
        }
        register("gitPull") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            self.pushAfter(1.2) { [weak self] in
                guard let self else { return nil }
                self.world.git[project]?.behind = 0
                return ["t": "gitPull", "project": project, "ok": true]
            }
        }
        register("gitFetch") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            self.pushAfter(1.0) { ["t": "gitFetch", "project": project, "ok": true] }
        }
        register("gitBranches") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            guard let repo = self.world.git[project] else {
                self.push(["t": "gitBranches", "project": project, "ok": false,
                           "error": "Not a git repository."])
                return
            }
            let branches: [[String: Any]] = repo.branches
                .sorted { $0.committerDate > $1.committerDate }
                .map { b in
                    var d: [String: Any] = ["name": b.name, "committerDate": b.committerDate]
                    if !b.remote.isEmpty { d["remote"] = b.remote }
                    return d
                }
            self.push(["t": "gitBranches", "project": project, "ok": true,
                       "current": repo.branch, "branches": branches])
        }
        register("gitCheckout") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let branch = o["branch"] as? String else { return }
            let remote = o["remote"] as? String ?? ""
            self.pushAfter(0.5) { [weak self] in
                guard let self else { return nil }
                guard var repo = self.world.git[project] else {
                    return ["t": "gitCheckout", "project": project, "ok": false,
                            "error": "Not a git repository."]
                }
                if repo.branch != branch {
                    repo.aheadByBranch[repo.branch] = repo.ahead
                    if !repo.branches.contains(where: { $0.remote.isEmpty && $0.name == branch }) {
                        repo.branches.insert(DemoWorld.GitBranch(name: branch, committerDate: self.isoNow()), at: 0)
                    }
                    repo.branch = branch
                    repo.detached = false
                    repo.ahead = repo.aheadByBranch[branch] ?? 0
                    repo.behind = 0
                    repo.hasUpstream = !remote.isEmpty || repo.ahead > 0
                        || repo.branches.contains { !$0.remote.isEmpty && $0.name == branch }
                    self.world.git[project] = repo
                    self.pushGitChanged(project)
                }
                return ["t": "gitCheckout", "project": project, "ok": true]
            }
        }
        register("gitCreateBranch") { [weak self] o in
            guard let self, let project = o["project"] as? String, let name = o["name"] as? String else { return }
            let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
            self.pushAfter(0.3) { [weak self] in
                guard let self else { return nil }
                guard var repo = self.world.git[project] else {
                    return ["t": "gitCreateBranch", "project": project, "ok": false,
                            "error": "Not a git repository."]
                }
                guard !trimmed.isEmpty else {
                    return ["t": "gitCreateBranch", "project": project, "ok": false,
                            "error": "Branch name can't be empty."]
                }
                guard !repo.branches.contains(where: { $0.remote.isEmpty && $0.name == trimmed }) else {
                    return ["t": "gitCreateBranch", "project": project, "ok": false,
                            "error": "A branch named \(trimmed) already exists."]
                }
                repo.aheadByBranch[repo.branch] = repo.ahead
                repo.branches.insert(DemoWorld.GitBranch(name: trimmed, committerDate: self.isoNow()), at: 0)
                repo.branch = trimmed
                repo.detached = false
                repo.ahead = 0
                repo.behind = 0
                repo.hasUpstream = false
                self.world.git[project] = repo
                self.pushGitChanged(project)
                return ["t": "gitCreateBranch", "project": project, "ok": true]
            }
        }
        register("gitDiscardAll") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            self.pushAfter(0.4) { [weak self] in
                guard let self else { return nil }
                guard var repo = self.world.git[project] else {
                    return ["t": "gitDiscardAll", "project": project, "ok": false,
                            "error": "Not a git repository."]
                }
                repo.files = []
                self.world.git[project] = repo
                self.pushGitChanged(project)
                return ["t": "gitDiscardAll", "project": project, "ok": true]
            }
        }
        register("gitGenMessage") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            let files = o["files"] as? [String] ?? []
            self.pushAfter(1.5) { [weak self] in
                guard let self else { return nil }
                guard self.world.git[project] != nil else {
                    return ["t": "gitGenMessage", "project": project, "ok": false,
                            "error": "Not a git repository."]
                }
                return ["t": "gitGenMessage", "project": project, "ok": true,
                        "message": self.demoCommitMessage(files)]
            }
        }
        register("gitGenPr") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            self.pushAfter(1.8) { [weak self] in
                guard let self else { return nil }
                guard let repo = self.world.git[project] else {
                    return ["t": "gitGenPr", "project": project, "ok": false,
                            "error": "Not a git repository."]
                }
                let draft = self.demoPrDraft(repo)
                return ["t": "gitGenPr", "project": project, "ok": true,
                        "title": draft.title, "body": draft.body]
            }
        }
        register("gitCreatePr") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            self.pushAfter(1.5) { [weak self] in
                guard let self else { return nil }
                guard var repo = self.world.git[project] else {
                    return ["t": "gitCreatePr", "project": project, "ok": false,
                            "error": "Not a git repository."]
                }
                repo.ahead = 0
                repo.hasUpstream = true
                repo.aheadByBranch[repo.branch] = 0
                self.world.git[project] = repo
                return ["t": "gitCreatePr", "project": project, "ok": true,
                        "url": "https://github.com/demo/storefront/pull/42"]
            }
        }
        register("gitWatch") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            self.world.git[project]?.watched = true
            self.push(["t": "gitWatch", "project": project, "ok": true])
        }
        register("gitUnwatch") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            self.world.git[project]?.watched = false
            self.push(["t": "gitUnwatch", "project": project, "ok": true])
        }
    }

    // MARK: cross-domain hook

    /// Copy a project's git state onto a duplicate. Called by demoAddProject.
    func demoCloneGitState(from: String, to: String) {
        guard var repo = world.git[from] else { return }
        repo.watched = false
        world.git[to] = repo
    }

    // MARK: helpers

    private func pushGitChanged(_ project: String) {
        pushAfter(0.1) { [weak self] in
            guard let self, self.world.git[project]?.watched == true else { return nil }
            return ["t": "git-changed", "project": project]
        }
    }

    private func demoDiff(project: String, path: String) -> String {
        let file = world.git[project]?.files.first { $0.path == path }
        if let stored = file?.diff, !stored.isEmpty { return stored }
        if let canned = demoCannedDiffs[path] { return canned }
        if file?.status == "added" || file?.status == "untracked" {
            return genericAddedDiff(path)
        }
        return genericModifiedDiff(path)
    }

    private func isoNow() -> String {
        ISO8601DateFormatter().string(from: Date())
    }

    private func demoCommitMessage(_ files: [String]) -> String {
        let names = files.map { ($0 as NSString).lastPathComponent }
        if names.contains("payments.ts") || names.contains("CheckoutForm.tsx") {
            return "feat(checkout): redesign the checkout form and add a payments module"
        }
        if names.contains("page.tsx") {
            return "feat(checkout): move the checkout page to a two-column layout"
        }
        if !names.isEmpty, names.allSatisfy({ $0.lowercased().hasSuffix(".md") }) {
            return "docs: document the payments setup"
        }
        if names.count == 1 {
            return "chore: update \(names[0])"
        }
        return "chore: update \(names.count) files"
    }

    private func demoPrDraft(_ repo: DemoWorld.GitRepo) -> (title: String, body: String) {
        let title = repo.branch.contains("checkout-redesign")
            ? "Redesign the checkout flow"
            : prettyBranchTitle(repo.branch)
        var bullets = repo.files.map { "- \(changeVerb($0.status)) `\($0.path)`" }
        if bullets.isEmpty { bullets = ["- \(title)"] }
        let body = """
        ## Summary
        \(bullets.joined(separator: "\n"))

        ## Testing
        - `npm test`
        - Manual checkout run against a test payment key
        """
        return (title, body)
    }

    private func prettyBranchTitle(_ branch: String) -> String {
        let tail = branch.split(separator: "/").last.map(String.init) ?? branch
        let words = tail
            .replacingOccurrences(of: "-", with: " ")
            .replacingOccurrences(of: "_", with: " ")
        return words.prefix(1).uppercased() + String(words.dropFirst())
    }

    private func changeVerb(_ status: String) -> String {
        switch status {
        case "added", "untracked": return "Add"
        case "deleted": return "Remove"
        case "renamed": return "Rename"
        default: return "Update"
        }
    }

    private func genericAddedDiff(_ path: String) -> String {
        """
        diff --git a/\(path) b/\(path)
        new file mode 100644
        index 0000000..b2d61a4
        --- /dev/null
        +++ b/\(path)
        @@ -0,0 +1,4 @@
        +export function demo() {
        +  return true
        +}
        +
        """
    }

    private func genericModifiedDiff(_ path: String) -> String {
        """
        diff --git a/\(path) b/\(path)
        index 3f1c2aa..9b04d1e 100644
        --- a/\(path)
        +++ b/\(path)
        @@ -1,5 +1,6 @@
         import { config } from "./config"

        -const enabled = false
        +const enabled = true
        +const retries = 3

         export { config }
        """
    }
}

private let demoCannedDiffs: [String: String] = [
    "components/CheckoutForm.tsx": demoCheckoutFormDiff,
    "app/checkout/page.tsx": demoCheckoutPageDiff,
    "lib/payments.ts": demoPaymentsDiff,
    "README.md": demoReadmeDiff,
]

private let demoCheckoutFormDiff = """
diff --git a/components/CheckoutForm.tsx b/components/CheckoutForm.tsx
index 4a5c2de..8f13a9b 100644
--- a/components/CheckoutForm.tsx
+++ b/components/CheckoutForm.tsx
@@ -3,6 +3,8 @@
 import { Button } from "@/components/ui/button"
 import { Input } from "@/components/ui/input"
 import { formatPrice } from "@/lib/format"
+import { createPaymentIntent, type PaymentMethod } from "@/lib/payments"
+import { PaymentMethodPicker } from "./PaymentMethodPicker"

 type CheckoutFormProps = {
   cart: Cart
@@ -11,11 +13,21 @@ type CheckoutFormProps = {

 export function CheckoutForm({ cart, onComplete }: CheckoutFormProps) {
   const [email, setEmail] = useState("")
+  const [method, setMethod] = useState<PaymentMethod>("card")
   const [submitting, setSubmitting] = useState(false)
+  const [error, setError] = useState<string | null>(null)

   async function handleSubmit(event: React.FormEvent) {
     event.preventDefault()
     setSubmitting(true)
-    await submitOrder({ email, items: cart.items })
-    onComplete()
+    setError(null)
+    try {
+      const intent = await createPaymentIntent(cart, method)
+      await submitOrder({ email, intent, items: cart.items })
+      onComplete()
+    } catch {
+      setError("Payment failed. Please try again.")
+    } finally {
+      setSubmitting(false)
+    }
   }
@@ -32,6 +44,8 @@ export function CheckoutForm({ cart, onComplete }: CheckoutFormProps) {
         onChange={(e) => setEmail(e.target.value)}
         required
       />
+      <PaymentMethodPicker value={method} onChange={setMethod} />
+      {error && <p className="text-sm text-red-600">{error}</p>}
       <Button type="submit" disabled={submitting}>
         {submitting ? "Placing order…" : `Pay ${formatPrice(cart.total)}`}
       </Button>
"""

private let demoCheckoutPageDiff = """
diff --git a/app/checkout/page.tsx b/app/checkout/page.tsx
index c91e044..2b7a51c 100644
--- a/app/checkout/page.tsx
+++ b/app/checkout/page.tsx
@@ -1,13 +1,19 @@
 import { CheckoutForm } from "@/components/CheckoutForm"
+import { OrderSummary } from "@/components/OrderSummary"
 import { getCart } from "@/lib/cart"

+export const metadata = { title: "Checkout" }
+
 export default async function CheckoutPage() {
   const cart = await getCart()

   return (
-    <main className="mx-auto max-w-lg px-4 py-8">
-      <h1 className="text-2xl font-semibold">Checkout</h1>
-      <CheckoutForm cart={cart} />
+    <main className="mx-auto grid max-w-4xl gap-8 px-4 py-8 md:grid-cols-[1fr_360px]">
+      <section>
+        <h1 className="text-2xl font-semibold">Checkout</h1>
+        <CheckoutForm cart={cart} />
+      </section>
+      <OrderSummary cart={cart} />
     </main>
   )
 }
"""

private let demoPaymentsDiff = """
diff --git a/lib/payments.ts b/lib/payments.ts
new file mode 100644
index 0000000..7d1f2ab
--- /dev/null
+++ b/lib/payments.ts
@@ -0,0 +1,22 @@
+import type { Cart } from "./cart"
+
+export type PaymentMethod = "card" | "apple-pay"
+
+export type PaymentIntent = {
+  id: string
+  amount: number
+  method: PaymentMethod
+}
+
+export async function createPaymentIntent(
+  cart: Cart,
+  method: PaymentMethod,
+): Promise<PaymentIntent> {
+  const res = await fetch("/api/payments/intent", {
+    method: "POST",
+    headers: { "Content-Type": "application/json" },
+    body: JSON.stringify({ amount: cart.total, method }),
+  })
+  if (!res.ok) throw new Error("Could not start the payment")
+  return res.json()
+}
"""

private let demoReadmeDiff = """
diff --git a/README.md b/README.md
index e4a10bd..f6c92d3 100644
--- a/README.md
+++ b/README.md
@@ -6,7 +6,12 @@ ## Getting started

 ```sh
 npm install
 npm run dev
 ```

+## Payments
+
+Checkout talks to the new payments module in `lib/payments.ts`. Set
+`PAYMENT_API_KEY` in `.env.local` before testing the flow locally.
+
 ## Deployment
"""

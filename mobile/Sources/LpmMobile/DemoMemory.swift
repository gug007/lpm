import Foundation

/// Demo handlers for Session Memory: the folder listing (previews only), one
/// document in full, compare-and-swap saves, and deletes. Writes land in the
/// world and are followed by a `memory-changed` push, so the live refresh an
/// agent CLI normally triggers happens in the demo too.
///
/// A duplicate reads and writes its original's folder, exactly as on a Mac, so a
/// project duplicated in Demo Mode opens the sessions it was copied from.
extension DemoServer {
    func registerMemoryHandlers() {
        seedMemoryFixtures()

        register("memory") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            self.pushAfter(0.35) { [weak self] in self?.memoryListPayload(project) }
        }

        register("memorySession") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let name = o["name"] as? String else { return }
            self.pushAfter(0.3) { [weak self] in
                guard let self else { return nil }
                let owner = self.memoryOwner(project)
                guard let doc = self.world.memoryDocs[owner]?.first(where: { $0.name == name }) else {
                    return ["t": "memorySession", "project": project, "name": name,
                            "ok": false, "error": "This session was removed."]
                }
                var reply = self.memorySessionDict(doc, owner: owner, preview: false)
                reply["t"] = "memorySession"
                reply["project"] = project
                reply["ok"] = true
                return reply
            }
        }

        register("memorySave") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let name = o["name"] as? String else { return }
            let content = o["content"] as? String ?? ""
            let baseline = o["baseline"] as? String
            self.pushAfter(0.45) { [weak self] in
                guard let self else { return nil }
                var reply: [String: Any] = ["t": "memorySave", "project": project, "name": name]
                if let failure = self.saveMemoryDoc(project, name: name, content: content,
                                                    baseline: baseline) {
                    reply["ok"] = false
                    reply["error"] = failure
                } else {
                    reply["ok"] = true
                }
                return reply
            }
        }

        register("memoryDelete") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let name = o["name"] as? String else { return }
            self.pushAfter(0.35) { [weak self] in
                guard let self else { return nil }
                let owner = self.memoryOwner(project)
                if self.world.memoryDocs[owner]?.contains(where: { $0.name == name }) == true {
                    self.world.memoryDocs[owner]?.removeAll { $0.name == name }
                    self.pushMemoryChanged(owner)
                }
                return ["t": "memoryDelete", "project": project, "name": name, "ok": true]
            }
        }
    }

    // MARK: state

    /// The folder a project's sessions live in: its original's when it is a
    /// duplicate, its own otherwise.
    private func memoryOwner(_ project: String) -> String {
        let parent = world.project(named: project)?.parentName ?? ""
        return parent.isEmpty ? project : parent
    }

    private func memoryDir(_ owner: String) -> String { "~/.lpm/memory/\(owner)" }

    private func memoryListPayload(_ project: String) -> [String: Any] {
        let owner = memoryOwner(project)
        let docs = (world.memoryDocs[owner] ?? [])
            .sorted { $0.updatedAt == $1.updatedAt ? $0.name < $1.name : $0.updatedAt > $1.updatedAt }
        return [
            "t": "memory", "project": project, "ok": true,
            "exists": world.memoryDocs[owner] != nil,
            "dir": memoryDir(owner),
            "sessions": docs.map { memorySessionDict($0, owner: owner, preview: true) },
        ]
    }

    /// One session as the wire carries it. On a list `content` is the first 1200
    /// characters; a `memorySession` fetch carries the whole document.
    private func memorySessionDict(_ doc: DemoWorld.MemoryDoc, owner: String,
                                   preview: Bool) -> [String: Any] {
        [
            "name": doc.name,
            "title": doc.title,
            "path": "\(memoryDir(owner))/\(doc.name).md",
            "updatedAt": doc.updatedAt,
            "size": doc.content.utf8.count,
            "content": preview ? String(doc.content.prefix(1200)) : doc.content,
        ]
    }

    /// Apply a save, returning the failure to report. The bare `"modified"` is the
    /// lost compare-and-swap the phone turns into its own copy.
    private func saveMemoryDoc(_ project: String, name: String, content: String,
                               baseline: String?) -> String? {
        guard isMemorySlug(name) else {
            return "A session name may only use lowercase letters, numbers and dashes."
        }
        let owner = memoryOwner(project)
        var docs = world.memoryDocs[owner] ?? []
        let index = docs.firstIndex { $0.name == name }
        if let baseline {
            // A session that isn't there yet matches only an empty baseline.
            let current = index.map { docs[$0].content } ?? ""
            guard current == baseline else { return "modified" }
        }
        let now = Int(Date().timeIntervalSince1970)
        let title = memoryTitle(content, fallback: name)
        if let index {
            docs[index].content = content
            docs[index].title = title
            docs[index].updatedAt = now
        } else {
            docs.append(DemoWorld.MemoryDoc(name: name, title: title, content: content,
                                            updatedAt: now))
        }
        world.memoryDocs[owner] = docs
        pushMemoryChanged(owner)
        return nil
    }

    /// The same push FSEvents produces when an agent CLI writes the folder. It
    /// carries the owner, so a duplicate showing shared sessions refreshes too.
    private func pushMemoryChanged(_ owner: String) {
        pushAfter(0.6) { ["t": "memory-changed", "project": owner] }
    }

    private func isMemorySlug(_ name: String) -> Bool {
        guard (1...64).contains(name.count), let first = name.first,
              first.isASCII, first.isNumber || first.isLowercase else { return false }
        return name.allSatisfy { $0.isASCII && ($0 == "-" || $0.isNumber || $0.isLowercase) }
    }

    private func memoryTitle(_ content: String, fallback: String) -> String {
        for line in content.split(separator: "\n", omittingEmptySubsequences: false) {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard trimmed.hasPrefix("# ") else { continue }
            let title = trimmed.dropFirst(2).trimmingCharacters(in: .whitespaces)
            return title.isEmpty ? fallback : title
        }
        return fallback
    }

    // MARK: fixtures

    private func seedMemoryFixtures() {
        world.memoryDocs["storefront"] = [
            memoryDoc(
                name: "checkout-redesign", title: "Checkout redesign",
                goal: """
                Rebuild checkout as a two-column flow and move card handling into a payments \
                module the API can share.
                """,
                state: """
                The two-column layout and the payment method picker are on \
                `feat/checkout-redesign`. Card and Apple Pay both go through `lib/payments.ts`, \
                and a declined card now shows an inline message instead of a toast. Totals are \
                memoized. The end-to-end run still flakes around the payment mock — that is the \
                only thing between this branch and review.
                """,
                entries: [
                    (5_760, "claude", [
                        "- Done: Split the checkout page into a form column and an order summary column",
                        "- Decided: Wrapped the existing form instead of rewriting it — its validation rules are the only ones covered by tests",
                        "- Next: Pull card handling out of the form",
                    ]),
                    (3_100, "codex", [
                        "- Done: Added `lib/payments.ts` with `createPaymentIntent` and a `PaymentMethod` union",
                        "- Learned: A declined card comes back as 402 with an empty body, so the message shown to the shopper has to come from the client",
                        "- Next: Wire the picker into the form",
                    ]),
                    (1_450, "claude", [
                        "- Done: Payment method picker wired in; a declined card shows an inline error and keeps the form filled",
                        "- Decided: Create the payment intent before submit so a decline never loses what was typed",
                        "- Open: The order summary recomputes totals on every keystroke",
                        "- Next: Memoize the totals",
                    ]),
                    (95, "claude", [
                        "- Done: Memoized the totals; the summary no longer recomputes while typing",
                        "- Learned: The end-to-end payment mock resolves after the assertion on a cold run, roughly one run in five",
                        "- Next: Warm the mock in the test setup, then run the suite three times before opening the pull request",
                    ]),
                ]),
            memoryDoc(
                name: "payments-module", title: "Payments module",
                goal: "Give the storefront and the gateway one place to create and confirm payments.",
                state: """
                `createPaymentIntent` is in and used by checkout. Refunds are still a gateway-only \
                path; the shared client stops at confirmation.
                """,
                entries: [
                    (7_300, "codex", [
                        "- Done: Sketched the module boundary — intent creation and confirmation shared, refunds stay server side",
                        "- Decided: Kept the amount in minor units end to end to avoid rounding on the way through",
                    ]),
                    (1_580, "codex", [
                        "- Done: Confirmation path landed with a typed error for declines",
                        "- Open: Retries after a network drop can create a second intent — needs an idempotency key",
                        "- Next: Thread an idempotency key through from the form",
                    ]),
                ]),
            memoryDoc(
                name: "cart-badge-bug", title: "Cart badge not updating",
                goal: "The header badge misses the first item added from a product page.",
                state: """
                Traced to the badge reading a snapshot taken before the cart store hydrates. A fix \
                is drafted but not committed — reproduce once more on a cold load first.
                """,
                entries: [
                    (7_000, "claude", [
                        "- Done: Reproduced on a cold load; a warm load is always correct",
                        "- Learned: The badge subscribes after hydration finishes, so the first change is missed",
                        "- Next: Subscribe before hydration and seed from the hydrated value",
                    ]),
                ]),
        ]
        world.memoryDocs["api-gateway"] = [
            memoryDoc(
                name: "rate-limiting", title: "Rate limiting middleware",
                goal: "Protect the upstream services with a per-key limiter that fails open.",
                state: """
                A token bucket per API key is in front of the proxy handler. Limits are read from \
                config at boot; reloading them without a restart is still open.
                """,
                entries: [
                    (4_320, "codex", [
                        "- Done: Token bucket per key, 429 with `Retry-After` when it trips",
                        "- Decided: Fail open if the limiter's own store is unreachable — a limiter outage must not become an API outage",
                    ]),
                    (2_800, "codex", [
                        "- Done: Added counters so the limiter shows up in the metrics endpoint",
                        "- Open: Limits only load at boot",
                        "- Next: Watch the config file and swap the buckets in place",
                    ]),
                ]),
            memoryDoc(
                name: "graceful-shutdown", title: "Graceful shutdown",
                goal: "Drain in-flight requests on SIGTERM instead of dropping them.",
                state: "Draining works; the shutdown deadline is hard-coded at 20s and should be configurable.",
                entries: [
                    (12_900, "claude", [
                        "- Done: Stop accepting connections on SIGTERM, wait for in-flight requests, then exit",
                        "- Learned: Long-polling clients hold the drain open — the deadline has to be short enough to matter",
                    ]),
                ]),
        ]
        world.memoryDocs["mobile-app"] = [
            memoryDoc(
                name: "startup-time", title: "App startup time",
                goal: "Get a cold start under two seconds on a mid-range device.",
                state: """
                Cold start is down from 3.4s to 2.3s. The remaining cost is the font and icon \
                bundle loaded before the first screen paints.
                """,
                entries: [
                    (9_800, "claude", [
                        "- Done: Profiled a cold start and found two thirds of it before the first frame",
                        "- Decided: Defer analytics and remote config until after the first screen",
                    ]),
                    (8_640, "claude", [
                        "- Done: Deferred both; cold start now 2.3s",
                        "- Next: Subset the font and lazy-load the icon set",
                    ]),
                ]),
        ]
    }

    /// Build one session log in the shape the lpm-memory skill writes: a goal, the
    /// current state, and an append-only timeline. The document's timestamp is its
    /// newest entry.
    private func memoryDoc(name: String, title: String, goal: String, state: String,
                           entries: [(minutesAgo: Int, agent: String, lines: [String])]) -> DemoWorld.MemoryDoc {
        var content = """
        # \(title)

        ## Goal
        \(goal)

        ## Current state
        \(state)

        ## Timeline
        """
        for entry in entries {
            content += "\n\n### \(memoryStamp(entry.minutesAgo)) — \(entry.agent)\n"
            content += entry.lines.joined(separator: "\n")
        }
        let newest = entries.map { $0.minutesAgo }.min() ?? 0
        return DemoWorld.MemoryDoc(name: name, title: title, content: content + "\n",
                                   updatedAt: Int(Date().timeIntervalSince1970) - newest * 60)
    }

    private func memoryStamp(_ minutesAgo: Int) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        return formatter.string(from: Date(timeIntervalSinceNow: -Double(minutesAgo) * 60))
    }
}

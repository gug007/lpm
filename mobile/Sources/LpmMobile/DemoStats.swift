import Foundation

/// Demo handlers for the agent-usage Stats screen and the paged message-History
/// screen (query/paging, favorites, folders, drafts, delete).
extension DemoServer {
    func registerStatsHandlers() {
        seedHistoryFixtures()

        register("stats") { [weak self] o in
            guard let self else { return }
            let days = (o["days"] as? NSNumber)?.intValue ?? 30
            self.pushAfter(0.6) { [weak self] in self?.statsPayload(days: days) }
        }

        register("historyQuery") { [weak self] o in
            guard let self else { return }
            let project = (o["project"] as? String).flatMap { $0.isEmpty ? nil : $0 }
            let search = (o["search"] as? String).flatMap { $0.isEmpty ? nil : $0 }?.lowercased()
            let favoritesOnly = o["favoritesOnly"] as? Bool ?? false
            let folder = (o["folder"] as? String).flatMap { $0.isEmpty ? nil : $0 }
            var items = self.world.historyMessages
            if let project { items = items.filter { $0.project == project } }
            if favoritesOnly { items = items.filter(\.favorite) }
            else if let folder { items = items.filter { $0.folder == folder } }
            if let search { items = items.filter { $0.text.lowercased().contains(search) } }
            items.sort { $0.at == $1.at ? $0.seq > $1.seq : $0.at > $1.at }
            if let before = o["before"] as? [String: Any],
               let at = (before["at"] as? NSNumber)?.intValue,
               let seq = (before["seq"] as? NSNumber)?.intValue {
                items = items.filter { $0.at < at || ($0.at == at && $0.seq < seq) }
            }
            let page = Array(items.prefix(60))
            self.push(["t": "historyQuery", "items": page.map(self.historyItemDict),
                       "hasMore": items.count > page.count])
        }

        register("historySaveDraft") { [weak self] o in
            guard let self else { return }
            var text = o["message"] as? String
            if text == nil, let m = o["message"] as? [String: Any] { text = m["text"] as? String }
            let nowMs = Int(Date().timeIntervalSince1970 * 1000)
            let seq = (self.world.historyMessages.map(\.seq).max() ?? 0) + 1
            self.world.historyMessages.append(DemoWorld.HistoryMessage(
                id: "hm-\(seq)", text: text ?? "", timestamp: nowMs, kind: "draft",
                project: o["project"] as? String ?? "", at: nowMs, seq: seq))
            self.push(["t": "historySaveDraft", "ok": true])
        }

        register("historyToggleFavorite") { [weak self] o in
            guard let self, let id = o["id"] as? String else { return }
            guard let i = self.world.historyMessages.firstIndex(where: { $0.id == id }) else {
                self.push(["t": "historyToggleFavorite", "id": id, "ok": false,
                           "error": "Message not found."])
                return
            }
            self.world.historyMessages[i].favorite.toggle()
            self.push(["t": "historyToggleFavorite", "id": id, "ok": true,
                       "favorite": self.world.historyMessages[i].favorite])
        }

        register("historySetFolder") { [weak self] o in
            guard let self, let id = o["id"] as? String else { return }
            guard let i = self.world.historyMessages.firstIndex(where: { $0.id == id }) else {
                self.push(["t": "historySetFolder", "ok": false, "error": "Message not found."])
                return
            }
            self.world.historyMessages[i].folder =
                (o["folder"] as? String).flatMap { $0.isEmpty ? nil : $0 }
            self.push(["t": "historySetFolder", "ok": true])
        }

        register("historyDelete") { [weak self] o in
            guard let self, let id = o["id"] as? String else { return }
            self.world.historyMessages.removeAll { $0.id == id }
            self.push(["t": "historyDelete", "ok": true])
        }

        register("historyFolders") { [weak self] _ in
            guard let self else { return }
            let folders = self.world.historyFolders
                .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            self.push(["t": "historyFolders", "folders": folders.map(self.historyFolderDict)])
        }

        register("historyCreateFolder") { [weak self] o in
            guard let self else { return }
            let name = (o["name"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !name.isEmpty else {
                self.push(["t": "historyCreateFolder", "ok": false,
                           "error": "Folder name can't be empty."])
                return
            }
            if let existing = self.world.historyFolders
                .first(where: { $0.name.caseInsensitiveCompare(name) == .orderedSame }) {
                self.push(["t": "historyCreateFolder", "ok": true,
                           "folder": self.historyFolderDict(existing)])
                return
            }
            let next = (self.world.historyFolders
                .compactMap { Int($0.id.dropFirst("folder-".count)) }.max() ?? 0) + 1
            let folder = DemoWorld.HistoryFolder(id: "folder-\(next)", name: name)
            self.world.historyFolders.append(folder)
            self.push(["t": "historyCreateFolder", "ok": true,
                       "folder": self.historyFolderDict(folder)])
        }

        register("historyDeleteFolder") { [weak self] o in
            guard let self else { return }
            let byId = o["id"] as? String
            let byName = o["name"] as? String
            if let folder = self.world.historyFolders.first(where: {
                (byId != nil && $0.id == byId) || (byName != nil && $0.name == byName)
            }) {
                for i in self.world.historyMessages.indices
                where self.world.historyMessages[i].folder == folder.id {
                    self.world.historyMessages[i].folder = nil
                }
                self.world.historyFolders.removeAll { $0.id == folder.id }
            }
            self.push(["t": "historyDeleteFolder", "ok": true])
        }
    }

    // MARK: history fixtures + builders

    private func seedHistoryFixtures() {
        let nowMs = Int(Date().timeIntervalSince1970 * 1000)
        let checkout = "folder-1"
        world.historyFolders = [DemoWorld.HistoryFolder(id: checkout, name: "Checkout")]

        var newestFirst: [(minutesAgo: Int, text: String, project: String, kind: String,
                           favorite: Bool, folder: String?)] = [
            (18, "Investigate the flaky checkout e2e — start with the payment mock timeouts",
             "storefront", "draft", false, nil),
            (42, "Fix the checkout button spacing on mobile", "storefront", "sent", false, checkout),
            (95, "Handle declined cards gracefully in the checkout flow",
             "storefront", "sent", true, checkout),
            (160, "Add rate limiting middleware to the gateway", "api-gateway", "sent", true, nil),
            (230, "Write unit tests for lib/payments.ts", "storefront", "sent", false, checkout),
            (310, "Fix the flicker when switching tabs on Android", "mobile-app", "sent", false, nil),
            (420, "Refactor CheckoutForm to use react-hook-form",
             "storefront", "sent", true, checkout),
            (560, "Draft a post about the Astro migration", "blog", "sent", false, nil),
            (700, "Fix Button focus ring in dark mode", "design-system", "sent", false, nil),
            (840, "Add loading skeletons to the product grid", "storefront", "sent", false, nil),
            (1_000, "Return 429 with Retry-After when the limiter trips",
             "api-gateway", "sent", false, nil),
            (1_200, "Plan the Q3 component audit — list components missing dark mode",
             "design-system", "draft", false, nil),
            (1_400, "Why is the cart badge not updating after adding an item?",
             "storefront", "sent", false, nil),
        ]

        let filler: [(String, String)] = [
            ("Add empty state to the order history page", "storefront"),
            ("Optimize product images with next/image", "storefront"),
            ("Add a promo code field to the cart summary", "storefront"),
            ("Debounce the header search input", "storefront"),
            ("Migrate the product page to server components", "storefront"),
            ("Add Apple Pay to the payment options", "storefront"),
            ("Tighten Lighthouse scores on the landing page", "storefront"),
            ("Fix the hydration warning on the cart drawer", "storefront"),
            ("Add structured logging with request IDs", "api-gateway"),
            ("Write a health check that verifies upstream connectivity", "api-gateway"),
            ("Profile the proxy hot path and cut allocations", "api-gateway"),
            ("Add graceful shutdown on SIGTERM", "api-gateway"),
            ("Cache upstream auth lookups for a minute", "api-gateway"),
            ("Add pull to refresh on the feed screen", "mobile-app"),
            ("Persist auth tokens in the secure store", "mobile-app"),
            ("Profile app startup and trim the bundle", "mobile-app"),
            ("Fix the keyboard avoiding view on the login screen", "mobile-app"),
            ("Add RSS feed generation", "blog"),
            ("Fix code block overflow on small screens", "blog"),
            ("Add reading time estimates to post headers", "blog"),
            ("Set up OG image generation for posts", "blog"),
            ("Add a Tooltip component with keyboard support", "design-system"),
            ("Document the color tokens in Storybook", "design-system"),
            ("Add size variants to the TextField component", "design-system"),
            ("Write visual regression tests for Button states", "design-system"),
        ]
        for pass in 0..<2 {
            for (i, item) in filler.enumerated() {
                let age = 1_600 + (pass * filler.count + i) * 710
                newestFirst.append((age, item.0, item.1, "sent", false, nil))
            }
        }

        var messages: [DemoWorld.HistoryMessage] = []
        for (i, e) in newestFirst.reversed().enumerated() {
            let at = nowMs - e.minutesAgo * 60_000
            messages.append(DemoWorld.HistoryMessage(
                id: "hm-\(i + 1)", text: e.text, timestamp: at, favorite: e.favorite,
                folder: e.folder, kind: e.kind, project: e.project, at: at, seq: i + 1))
        }
        world.historyMessages = messages
    }

    private func historyItemDict(_ m: DemoWorld.HistoryMessage) -> [String: Any] {
        var d: [String: Any] = [
            "id": m.id, "text": m.text, "images": [String: String](), "timestamp": m.timestamp,
            "favorite": m.favorite, "kind": m.kind, "project": m.project, "at": m.at, "seq": m.seq,
        ]
        if let folder = m.folder { d["folder"] = folder }
        return d
    }

    private func historyFolderDict(_ f: DemoWorld.HistoryFolder) -> [String: Any] {
        let count = world.historyMessages.filter { $0.folder == f.id }.count
        return ["id": f.id, "name": f.name, "count": count]
    }

    // MARK: stats dataset

    private struct StatSession {
        let dayIndex: Int
        let provider: String
        let project: String
        let model: String
        let startedAt: Int
        let lastAt: Int
        let input: Int
        let cacheCreation: Int
        let cacheRead: Int
        let output: Int
        let reasoning: Int
    }

    private struct TokenAgg {
        var sessions = 0
        var input = 0
        var cacheCreation = 0
        var cacheRead = 0
        var output = 0
        var reasoning = 0

        mutating func add(_ s: StatSession) {
            sessions += 1
            input += s.input
            cacheCreation += s.cacheCreation
            cacheRead += s.cacheRead
            output += s.output
            reasoning += s.reasoning
        }

        var tokensDict: [String: Any] {
            [
                "inputTokens": input,
                "cachedInputTokens": cacheCreation + cacheRead,
                "cacheCreationInputTokens": cacheCreation,
                "cacheReadInputTokens": cacheRead,
                "outputTokens": output,
                "reasoningTokens": reasoning,
                "totalTokens": input + output,
            ]
        }
    }

    private func statFrac(_ a: Int, _ b: Int, _ salt: Int) -> Double {
        var x = UInt64(truncatingIfNeeded: a &* 2_654_435_761 &+ b &* 40_503 &+ salt &* 69_427)
        x ^= x >> 33
        x = x &* 0xff51_afd7_ed55_8ccd
        x ^= x >> 33
        return Double(x % 10_000) / 10_000
    }

    private func statSessions(cal: Calendar, now: Date) -> [StatSession] {
        let projectPool = ["storefront", "storefront", "api-gateway", "storefront",
                           "mobile-app", "storefront", "blog", "design-system"]
        let startOfToday = cal.startOfDay(for: now)
        let nowMs = Int(now.timeIntervalSince1970 * 1000)
        var out: [StatSession] = []
        for d in 0..<14 {
            guard let dayStart = cal.date(byAdding: .day, value: -d, to: startOfToday) else { continue }
            let dayStartMs = Int(dayStart.timeIntervalSince1970 * 1000)
            let weekday = cal.component(.weekday, from: dayStart)
            let weekend = weekday == 1 || weekday == 7
            let count = weekend ? 1 + d % 2 : 3 + (d * 7) % 5
            for s in 0..<count {
                let f0 = statFrac(d, s, 1)
                let f1 = statFrac(d, s, 2)
                let f2 = statFrac(d, s, 3)
                let f3 = statFrac(d, s, 4)
                let project = projectPool[(d * 3 + s * 5) % projectPool.count]
                // All timestamps are unix millis, like the real scanner.
                let lastAt: Int
                if d == 0 {
                    let back = 1_400_000 + s * 7_600_000 + Int(f0 * 1_500_000)
                    lastAt = min(nowMs, max(dayStartMs + 1_800_000, nowMs - back))
                } else {
                    lastAt = dayStartMs + Int((9.5 + Double(s) * 1.9 + f0 * 1.3) * 3_600_000)
                }
                let startedAt = lastAt - Int((900 + f1 * 5_400) * 1_000)
                if (d + s) % 3 == 2 {
                    let input = 320_000 + Int(f1 * 1_100_000)
                    let output = 12_000 + Int(f2 * 28_000)
                    out.append(StatSession(
                        dayIndex: d, provider: "codex", project: project, model: "gpt-5.1-codex",
                        startedAt: startedAt, lastAt: lastAt,
                        input: input, cacheCreation: 0,
                        cacheRead: Int(Double(input) * (0.55 + f2 * 0.2)),
                        output: output,
                        reasoning: Int(Double(output) * (0.35 + f3 * 0.25))))
                } else {
                    let input = 1_200_000 + Int(f1 * 3_600_000)
                    out.append(StatSession(
                        dayIndex: d, provider: "claude", project: project,
                        model: (d + s) % 3 == 0 ? "claude-opus-4-5" : "claude-sonnet-4-5",
                        startedAt: startedAt, lastAt: lastAt,
                        input: input,
                        cacheCreation: Int(Double(input) * (0.05 + f3 * 0.05)),
                        cacheRead: Int(Double(input) * (0.70 + f2 * 0.16)),
                        output: 18_000 + Int(f2 * 52_000),
                        reasoning: 0))
                }
            }
        }
        return out
    }

    private func sessionTokensDict(_ s: StatSession) -> [String: Any] {
        var agg = TokenAgg()
        agg.add(s)
        return agg.tokensDict
    }

    private func breakdownDicts(_ sessions: [StatSession], key: (StatSession) -> String,
                                label: (String) -> String) -> [[String: Any]] {
        var order: [String] = []
        var aggs: [String: TokenAgg] = [:]
        for s in sessions {
            let k = key(s)
            if aggs[k] == nil { order.append(k) }
            aggs[k, default: TokenAgg()].add(s)
        }
        return order.map { k in
            let a = aggs[k] ?? TokenAgg()
            return ["key": k, "label": label(k), "sessions": a.sessions, "tokens": a.tokensDict]
        }
    }

    private func statsPayload(days: Int) -> [String: Any] {
        let cal = Calendar(identifier: .gregorian)
        let now = Date()
        let nowMs = Int(now.timeIntervalSince1970 * 1000)
        let all = statSessions(cal: cal, now: now)
        let included = days == 0 ? all : all.filter { $0.dayIndex < days }

        var totals = TokenAgg()
        for s in included { totals.add(s) }

        var daily: [[String: Any]] = []
        for d in stride(from: 13, through: 0, by: -1) {
            let daySessions = included.filter { $0.dayIndex == d }
            guard !daySessions.isEmpty,
                  let dayStart = cal.date(byAdding: .day, value: -d, to: cal.startOfDay(for: now))
            else { continue }
            let claude = daySessions.filter { $0.provider == "claude" }
                .reduce(0) { $0 + $1.input + $1.output }
            let codex = daySessions.filter { $0.provider == "codex" }
                .reduce(0) { $0 + $1.input + $1.output }
            let c = cal.dateComponents([.year, .month, .day], from: dayStart)
            daily.append([
                "date": String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0),
                "claudeTokens": claude, "codexTokens": codex, "totalTokens": claude + codex,
            ])
        }

        let recent = included.sorted { $0.lastAt > $1.lastAt }.prefix(12)
            .map { s -> [String: Any] in
                ["provider": s.provider, "project": s.project, "model": s.model,
                 "startedAt": s.startedAt, "lastAt": s.lastAt, "tokens": sessionTokensDict(s)]
            }

        let providerLabels = ["claude": "Claude Code", "codex": "Codex"]
        return [
            "t": "stats", "ok": true,
            "stats": [
                "generatedAt": nowMs,
                // Echo the requested period — the phone drops a reply whose days
                // don't match the current selection.
                "days": days,
                "sessions": included.count,
                "totals": totals.tokensDict,
                "providers": breakdownDicts(included, key: \.provider) { providerLabels[$0] ?? $0 },
                "projects": breakdownDicts(included, key: \.project) { $0 },
                "models": breakdownDicts(included, key: \.model) { $0 },
                "daily": daily,
                "recentSessions": recent,
                "sources": [
                    ["provider": "claude", "files": all.filter { $0.provider == "claude" }.count],
                    ["provider": "codex", "files": all.filter { $0.provider == "codex" }.count],
                ],
            ],
        ]
    }
}

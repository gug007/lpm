import Foundation

private let reset = "\u{1B}[0m"
private let bold = "\u{1B}[1m"
private let dim = "\u{1B}[2m"
private let orange = "\u{1B}[38;5;208m"
private let teal = "\u{1B}[38;5;36m"
private let blue = "\u{1B}[38;5;75m"
private let textDot = "\u{1B}[38;5;153m⏺\u{1B}[0m"

/// Demo handlers for agent tabs: the agents a new tab can start, each project's
/// past conversations, and resuming one. An agent tab opens already past its
/// startup, so it takes input the way the Claude tab does.
extension DemoServer {
    func registerAgentHandlers() {
        register("agentOptions") { [weak self] _ in
            self?.push(["t": "agentOptions", "agents": Self.demoAgentOptions])
        }
        register("agentSessions") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            guard self.world.project(named: project)?.isRemote != true else {
                self.push(["t": "agentSessions", "project": project, "ok": false,
                           "error": "Sessions of an SSH project live on its host."])
                return
            }
            let search = (o["search"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let limit = max(1, min(500, o["limit"] as? Int ?? 40))
            let matching = Self.demoSessions(project).filter {
                search.isEmpty || $0.title.localizedCaseInsensitiveContains(search)
                    || $0.preview.localizedCaseInsensitiveContains(search)
            }
            self.pushAfter(0.4, ["t": "agentSessions", "project": project, "ok": true,
                                 "search": o["search"] ?? "", "limit": limit,
                                 "hasMore": matching.count > limit,
                                 "sessions": matching.prefix(limit).map { self.sessionRow($0, project: project) }])
        }
        register("resumeSession") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let provider = o["provider"] as? String, let sessionId = o["sessionId"] as? String else { return }
            let title = (o["title"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "Untitled session"
            let id = self.nextTerminalId(project).id
            let buffer = self.agentBanner(provider, project: project, model: "", effort: "")
                + "\(dim)  Resumed “\(title)”\(reset)\r\n\r\n"
                + "\(textDot) Picking up where we left off on \(bold)\(title)\(reset). What's next?\r\n\r\n"
                + "\(bold)>\(reset) "
            self.world.terminals[project, default: []].append(self.agentTab(id: id, label: title, project: project,
                                                                            cli: provider, buffer: buffer))
            self.world.sessionTabs["\(provider):\(sessionId)"] = id
            self.push(["t": "resumeSession", "ok": true])
        }
    }

    /// The tab a `newTerminal` with an agent opens, nil for a plain shell.
    func demoAgentTerminal(_ o: [String: Any], id: String, project: String) -> DemoWorld.Terminal? {
        guard let agent = (o["agent"] as? String).flatMap({ $0.isEmpty ? nil : $0 }),
              let option = Self.demoAgentOptions.first(where: { $0["id"] as? String == agent }) else { return nil }
        return demoAgentTab(agent, label: option["label"] as? String ?? agent, id: id, project: project,
                            model: o["model"] as? String ?? "", effort: o["effort"] as? String ?? "",
                            prompt: o["prompt"] as? String ?? "")
    }

    /// The tab a `runAction` with a `prompt` opens for an action that starts an
    /// agent, nil for any other action.
    func demoActionAgentTerminal(_ action: [String: Any], prompt: String, label: String,
                                 id: String, project: String) -> DemoWorld.Terminal? {
        let ids = Self.demoAgentOptions.compactMap { $0["id"] as? String }
        guard !prompt.isEmpty, action["type"] as? String == "terminal",
              let agent = agentCLI(in: action["cmd"] as? String ?? "", among: ids) else { return nil }
        return demoAgentTab(agent, label: label, id: id, project: project, model: "", effort: "", prompt: prompt)
    }

    private func demoAgentTab(_ agent: String, label: String, id: String, project: String,
                              model: String, effort: String, prompt: String) -> DemoWorld.Terminal {
        let prompt = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        var buffer = agentBanner(agent, project: project, model: model, effort: effort)
        if !prompt.isEmpty {
            buffer += "\(bold)>\(reset) \(prompt.replacingOccurrences(of: "\n", with: "\r\n  "))\r\n\r\n"
                + "\(textDot) On it — I'll read the relevant files first, then make the change.\r\n\r\n"
        }
        buffer += "\(bold)>\(reset) "
        return agentTab(id: id, label: label, project: project, cli: agent, buffer: buffer)
    }

    private func agentTab(id: String, label: String, project: String, cli: String,
                          buffer: String) -> DemoWorld.Terminal {
        var term = DemoWorld.Terminal(id: id, label: label, project: project, cli: cli, buffer: buffer)
        term.scriptStarted = true
        term.scriptFinished = true
        return term
    }

    private func agentBanner(_ agent: String, project: String, model: String, effort: String) -> String {
        let picked = [Self.optionLabel(agent, model: model), Self.effortLabel(agent, model: model, effort: effort)]
            .compactMap { $0 }
            .joined(separator: " · ")
        let setup = picked.isEmpty ? "" : "  model: \(picked)\r\n"
        switch agent {
        case "claude":
            return "\(orange)✻\(reset) \(bold)Welcome to Claude Code\(reset)\r\n\r\n"
                + "\(dim)  /help for help, /status for your current setup\r\n\r\n"
                + "  cwd: /Users/demo/dev/\(project)\r\n\(setup)\(reset)\r\n"
        case "codex":
            return "\(teal)>_\(reset) \(bold)OpenAI Codex\(reset) \(dim)(v0.58.0)\(reset)\r\n\r\n"
                + "\(dim)  directory: ~/dev/\(project)\r\n\(setup)\(reset)\r\n"
        case "gemini":
            return "\(blue)✦\(reset) \(bold)Gemini CLI\(reset)\r\n\r\n"
                + "\(dim)  Tips: ask questions, edit files, or run commands.\r\n"
                + "  cwd: ~/dev/\(project)\(reset)\r\n\r\n"
        case "cursor":
            return "\(bold)Cursor Agent\(reset)\r\n\r\n\(dim)  ~/dev/\(project)\(reset)\r\n\r\n"
        default:
            return "\(bold)opencode\(reset) \(dim)v0.15.2\r\n\r\n  cwd: ~/dev/\(project)\(reset)\r\n\r\n"
        }
    }

    private func sessionRow(_ s: DemoSession, project: String) -> [String: Any] {
        let key = "\(s.provider):\(s.sessionId)"
        var row: [String: Any] = [
            "key": key, "provider": s.provider, "sessionId": s.sessionId, "title": s.title,
            "preview": s.preview, "updatedAt": Int((Date().timeIntervalSince1970 - s.ago) * 1000),
        ]
        if let branch = s.branch { row["gitBranch"] = branch }
        if let account = s.account { row["account"] = account }
        if let tab = world.sessionTabs[key], world.terminals[project]?.contains(where: { $0.id == tab }) == true {
            row["openIn"] = tab
        }
        return row
    }

    // MARK: fixtures

    fileprivate struct DemoSession {
        let provider: String
        let sessionId: String
        let title: String
        let preview: String
        /// Seconds before now it last ran.
        let ago: TimeInterval
        let branch: String?
        var account: String?
    }

    private static let hour: TimeInterval = 3600
    private static let day: TimeInterval = 86_400

    private static func demoSessions(_ project: String) -> [DemoSession] {
        switch project {
        case "storefront":
            return [
                DemoSession(provider: "claude", sessionId: "7c1e4f2a-tax", title: "Fix checkout tax rounding",
                            preview: "Totals are off by a cent when a coupon and tax both apply",
                            ago: 2 * hour, branch: "fix/tax"),
                DemoSession(provider: "gemini", sessionId: "3f9a1c7e-ratelimits", title: "Add rate limits to the API",
                            preview: "Limit /v1/orders to 60 a minute per customer",
                            ago: 4 * hour, branch: "main"),
                DemoSession(provider: "claude", sessionId: "b93d0e51-applepay", title: "Add Apple Pay to checkout",
                            preview: "Offer Apple Pay in the payment step, behind a feature flag",
                            ago: day, branch: "main", account: "Work"),
                DemoSession(provider: "opencode", sessionId: "ses_4c2e8a1f9bSearch", title: "Search page skeleton",
                            preview: "Add a loading state to the search results page",
                            ago: day + 5 * hour, branch: "feat/search"),
                DemoSession(provider: "codex", sessionId: "019a6c2e-zustand", title: "Migrate cart store to Zustand",
                            preview: "Replace the cart context with a Zustand store and keep the badge in sync",
                            ago: 3 * day, branch: "cart-store"),
                DemoSession(provider: "claude", sessionId: "e4a7f6c3-node22", title: "Why does CI fail on Node 22?",
                            preview: "", ago: 6 * day, branch: "main"),
                DemoSession(provider: "cursor", sessionId: "8d2b6e40-cards", title: "Tidy the product card styles",
                            preview: "Use the spacing tokens on product cards and fix the price wrap",
                            ago: 8 * day, branch: "main"),
                DemoSession(provider: "codex", sessionId: "019a2b71-coupons", title: "Write e2e tests for coupons",
                            preview: "Playwright tests for applying, stacking and removing coupons",
                            ago: 12 * day, branch: "main"),
                DemoSession(provider: "claude", sessionId: "5f08d9b4-images", title: "Speed up product image loading",
                            preview: "Lazy-load product images and serve AVIF where the browser takes it",
                            ago: 40 * day, branch: "perf/images"),
            ]
        case "api-gateway":
            return [
                DemoSession(provider: "codex", sessionId: "019a7d10-ratelimit", title: "Add rate limiting middleware",
                            preview: "Token bucket per API key, configurable per route", ago: day, branch: "main"),
                DemoSession(provider: "claude", sessionId: "a2c4e6f8-authdocs", title: "Document the auth flow",
                            preview: "", ago: 9 * day, branch: "main"),
            ]
        default:
            return []
        }
    }

    private static func efforts(max: Bool) -> [[String: Any]] {
        var levels: [[String: Any]] = [
            ["value": "", "label": "Default"], ["value": "low", "label": "Low"],
            ["value": "medium", "label": "Medium"], ["value": "high", "label": "High"],
            ["value": "xhigh", "label": "Extra High"],
        ]
        if max { levels.append(["value": "max", "label": "Max"]) }
        return levels
    }

    private static func models(_ list: [(String, String)], max: Bool) -> [[String: Any]] {
        list.map { ["value": $0.0, "label": $0.1, "efforts": efforts(max: max)] }
    }

    static let demoAgentOptions: [[String: Any]] = [
        ["id": "claude", "label": "Claude Code",
         "models": models([("", "Default"), ("fable", "Fable"), ("opus", "Opus"), ("sonnet", "Sonnet"),
                           ("haiku", "Haiku")], max: true)],
        ["id": "codex", "label": "Codex",
         "models": models([("", "Default"), ("gpt-6.1-sol", "GPT-6.1 Sol"), ("gpt-6-astra", "GPT-6 Astra"),
                           ("gpt-5.5", "GPT-5.5")], max: false)],
        ["id": "gemini", "label": "Gemini", "models": [] as [[String: Any]]],
        ["id": "opencode", "label": "OpenCode", "models": [] as [[String: Any]]],
    ]

    private static func modelOption(_ agent: String, _ model: String) -> [String: Any]? {
        let option = demoAgentOptions.first { $0["id"] as? String == agent }
        return (option?["models"] as? [[String: Any]])?.first { $0["value"] as? String == model }
    }

    private static func optionLabel(_ agent: String, model: String) -> String? {
        guard !model.isEmpty else { return nil }
        return modelOption(agent, model)?["label"] as? String
    }

    private static func effortLabel(_ agent: String, model: String, effort: String) -> String? {
        guard !effort.isEmpty else { return nil }
        let levels = modelOption(agent, model)?["efforts"] as? [[String: Any]]
        return levels?.first { $0["value"] as? String == effort }?["label"] as? String
    }
}

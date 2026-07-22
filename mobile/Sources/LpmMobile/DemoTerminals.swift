import Foundation

private let reset = "\u{1B}[0m"
private let bold = "\u{1B}[1m"
private let dim = "\u{1B}[2m"
private let red = "\u{1B}[31m"
private let green = "\u{1B}[32m"
private let yellow = "\u{1B}[33m"
private let blueBold = "\u{1B}[1;34m"
private let cyan = "\u{1B}[36m"
private let orange = "\u{1B}[38;5;208m"
private let textDot = "\u{1B}[38;5;153m⏺\u{1B}[0m"
private let toolDot = "\u{1B}[32m⏺\u{1B}[0m"
private let pasteStart = "\u{1B}[200~"
private let pasteEnd = "\u{1B}[201~"

/// Demo handlers for the terminal engine: the terminal list, subscribe/seed,
/// a scripted fake shell + Claude Code session, lifecycle (new/close/rename/pin/
/// reorder), slash commands, mentions, uploads, and the composer parity surface
/// (actions, drafts, transform, history). Owns the cross-domain hooks
/// `demoCreateTerminals` and `demoWriteToShell`.
extension DemoServer {
    func registerTerminalsHandlers() {
        seedTerminalFixtures()

        register("terminals") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            self.push(self.world.terminalsPayload(project))
        }

        register("sub") { [weak self] o in
            guard let self, let id = o["id"] as? String,
                  let term = self.demoTerminal(id) else { return }
            self.updateTerminal(id) { $0.subscribed = true }
            var reply: [String: Any] = [
                "t": "seed", "id": id,
                "cols": term.cols, "rows": term.rows,
                "data": term.buffer, "owner": self.demoOwner,
            ]
            if let draft = self.world.composerDrafts[id], !draft.text.isEmpty {
                reply["draft"] = ["text": draft.text, "rev": draft.rev]
            }
            self.push(reply)
            if term.cli.isEmpty { self.armDevLog(id) }
            else if !term.scriptStarted { self.startClaudeScript(id) }
        }
        register("unsub") { [weak self] o in
            guard let self, let id = o["id"] as? String else { return }
            self.updateTerminal(id) { $0.subscribed = false }
        }
        register("claim") { [weak self] o in
            guard let self, let id = o["id"] as? String else { return }
            self.push(["t": "control", "id": id, "owner": self.demoOwner])
        }
        register("in") { [weak self] o in
            guard let self, let id = o["id"] as? String, let d = o["d"] as? String else { return }
            guard !d.hasPrefix("\u{0}") else { return }
            guard let term = self.demoTerminal(id) else { return }
            if term.cli.isEmpty { self.handleShellInput(id, d) }
            else { self.handleClaudeInput(id, d) }
        }
        register("resize") { [weak self] o in
            guard let self, let id = o["id"] as? String else { return }
            self.updateTerminal(id) { t in
                if let cols = o["cols"] as? Int, cols > 0 { t.cols = cols }
                if let rows = o["rows"] as? Int, rows > 0 { t.rows = rows }
            }
        }

        register("newTerminal") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            var n = (self.world.terminals[project]?.count ?? 0) + 1
            var id = "demo-\(project)-\(n)"
            while self.demoTerminal(id) != nil { n += 1; id = "demo-\(project)-\(n)" }
            let term = DemoWorld.Terminal(id: id, label: "Terminal \(n)", project: project,
                                          buffer: self.shellPrompt(project))
            self.world.terminals[project, default: []].append(term)
            self.push(["t": "newTerminal", "ok": true])
        }
        register("closeTerminal") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let id = o["id"] as? String else { return }
            let wasAgent = self.demoTerminal(id)?.cli == "claude"
            self.world.terminals[project]?.removeAll { $0.id == id }
            self.world.composerDrafts[id] = nil
            if wasAgent { self.demoSetAgentStatus(project: project, entries: []) }
            self.push(["t": "closeTerminal", "ok": true])
        }
        register("renameTerminal") { [weak self] o in
            guard let self, let id = o["id"] as? String, let label = o["label"] as? String else { return }
            self.updateTerminal(id) { $0.label = label }
            self.push(["t": "renameTerminal", "ok": true])
        }
        register("pinTerminal") { [weak self] o in
            guard let self, let id = o["id"] as? String else { return }
            self.updateTerminal(id) { $0.pinned.toggle() }
            self.push(["t": "pinTerminal", "ok": true])
        }
        register("reorderTerminals") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let order = o["order"] as? [String] else { return }
            if var list = self.world.terminals[project] {
                list.sort { a, b in (order.firstIndex(of: a.id) ?? .max) < (order.firstIndex(of: b.id) ?? .max) }
                self.world.terminals[project] = list
            }
        }

        register("slash") { [weak self] o in
            guard let self, let id = o["id"] as? String else { return }
            let isAgent = self.demoTerminal(id)?.cli == "claude"
            self.push(["t": "slash", "id": id,
                       "commands": isAgent ? self.claudeSlashCommands : []])
        }
        register("mentions") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            self.push(["t": "mentions", "project": project,
                       "entries": self.mentionEntries(project)])
        }
        register("upload") { [weak self] o in
            guard let self, let id = o["id"] as? String else { return }
            let mime = o["mime"] as? String ?? "image/png"
            let name = (o["name"] as? String).flatMap { $0.isEmpty ? nil : $0 }
                ?? "image-\(Int(Date().timeIntervalSince1970 * 1000)).\(self.fileExt(mime))"
            var reply: [String: Any] = ["t": "upload", "id": id, "ok": true,
                                        "path": "/Users/demo/uploads/\(name)"]
            if let reqId = o["reqId"] { reply["reqId"] = reqId }
            self.pushAfter(0.35, reply)
        }

        register("composerActions") { [weak self] _ in
            self?.push([
                "t": "composerActions",
                "actions": [
                    ["id": "improve", "icon": "sparkles", "label": "Improve writing",
                     "instruction": "Improve the writing of this text while keeping its meaning."],
                    ["id": "shorter", "icon": "minimize", "label": "Make shorter",
                     "instruction": "Make this text shorter and more concise."],
                    ["id": "grammar", "icon": "spellcheck", "label": "Fix grammar",
                     "instruction": "Fix the grammar and spelling of this text."],
                    ["id": "detailed", "icon": "zap", "label": "More detailed",
                     "instruction": "Make this text more detailed and specific."],
                ],
            ])
        }
        register("composerDraft") { [weak self] o in
            guard let self, let id = o["id"] as? String else { return }
            let text = o["text"] as? String ?? ""
            self.world.composerDraftRev += 1
            let rev = self.world.composerDraftRev
            if text.isEmpty { self.world.composerDrafts[id] = nil }
            else { self.world.composerDrafts[id] = DemoWorld.ComposerDraft(text: text, rev: rev) }
            self.push(["t": "composerDraft", "id": id, "text": text,
                       "rev": rev, "origin": DemoServer.deviceId])
        }
        register("transform") { [weak self] o in
            guard let self else { return }
            let reqId = o["reqId"] ?? ""
            let count = max(1, min(5, o["variants"] as? Int ?? 1))
            let rewrites = self.demoRewrites(o["text"] as? String ?? "",
                                             instruction: o["instruction"] as? String ?? "",
                                             count: count)
            for i in 0..<count {
                self.pushAfter(0.9 + 0.8 * Double(i),
                               ["t": "transform", "reqId": reqId, "idx": i,
                                "ok": true, "text": rewrites[i]])
            }
            self.pushAfter(0.9 + 0.8 * Double(count - 1) + 0.4,
                           ["t": "transformDone", "reqId": reqId, "ok": true])
        }

        register("history") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            let q = o["q"] as? String ?? ""
            let rows: [[String: Any]] = self.world.historyMessages
                .filter { $0.project == project && (q.isEmpty || $0.text.localizedCaseInsensitiveContains(q)) }
                .sorted { $0.at > $1.at }
                .prefix(30)
                .map { ["id": $0.id, "text": $0.text, "terminalLabel": "Claude",
                        "isDraft": $0.kind == "draft"] }
            self.push(["t": "history", "project": project, "rows": rows])
        }
        register("historyAdd") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let text = o["text"] as? String, !text.isEmpty else { return }
            let nowMs = Int(Date().timeIntervalSince1970 * 1000)
            let seq = (self.world.historyMessages.map(\.seq).max() ?? 0) + 1
            self.world.historyMessages.append(DemoWorld.HistoryMessage(
                id: "h\(nowMs)-\(seq)", text: text, timestamp: nowMs,
                project: project, at: nowMs, seq: seq))
        }
    }

    // MARK: cross-domain hooks

    /// Create the terminals for a freshly added project — mirrored from `copyOf`
    /// (fresh ids, fresh screens) or empty for a brand-new project. Called by
    /// demoAddProject.
    func demoCreateTerminals(project: String, copyOf: String?) {
        guard let copyOf, let src = world.terminals[copyOf] else {
            if world.terminals[project] == nil { world.terminals[project] = [] }
            return
        }
        world.terminals[project] = src.enumerated().map { i, t in
            var n = t
            n.id = "demo-\(project)-\(i + 1)"
            n.project = project
            n.buffer = t.cli.isEmpty ? shellPrompt(project) : claudeWelcome(project)
            n.scriptStarted = false
            n.scriptFinished = false
            n.subscribed = false
            n.pendingInput = ""
            n.queuedInput = ""
            n.queuedSubmit = false
            n.logTickArmed = false
            n.responding = false
            n.ackCount = 0
            return n
        }
    }

    /// Write canned output into the project's shell terminal and stream it to any
    /// subscriber, redrawing the prompt and any pending input under it.
    func demoWriteToShell(project: String, text: String) {
        guard let list = world.terminals[project],
              let idx = list.firstIndex(where: { $0.cli.isEmpty }) else { return }
        demoWriteToTerminal(id: list[idx].id, text: text)
    }

    /// Same as `demoWriteToShell`, targeting a specific terminal. Used by
    /// runAction to stream an action's output into its freshly spawned terminal.
    func demoWriteToTerminal(id: String, text: String) {
        guard let term = demoTerminal(id) else { return }
        var body = text.replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\n", with: "\r\n")
        if !body.hasSuffix("\r\n") { body += "\r\n" }
        let chunk = "\r\u{1B}[2K" + body + shellPrompt(term.project) + term.pendingInput
        appendBuffer(id, chunk)
        push(["t": "o", "id": id, "d": chunk])
    }

    // MARK: fixtures

    private func seedTerminalFixtures() {
        let prompt = shellPrompt("storefront")
        world.terminals["storefront"] = [
            DemoWorld.Terminal(id: "demo-storefront-1", label: "Terminal 1", project: "storefront",
                               buffer: prompt + "ls\r\n" + lsOutput("storefront") + prompt),
            DemoWorld.Terminal(id: "demo-storefront-claude", label: "Claude", project: "storefront",
                               emoji: "✨", cli: "claude", buffer: claudeWelcome("storefront")),
        ]
        world.composerDraftRev = 1
        world.composerDrafts["demo-storefront-claude"] = DemoWorld.ComposerDraft(
            text: "Add Apple Pay as a payment option in the new checkout flow", rev: 1)
    }

    private var demoOwner: [String: Any] {
        ["kind": "mobile", "id": DemoServer.deviceId, "label": "This device"]
    }

    func shellPrompt(_ project: String) -> String {
        "\u{1B}[1;36m~/dev/\(project)\(reset) \(dim)$\(reset) "
    }

    private func claudeWelcome(_ project: String) -> String {
        "\(orange)✻\(reset) \(bold)Welcome to Claude Code\(reset)\r\n\r\n"
            + "\(dim)  /help for help, /status for your current setup\r\n\r\n"
            + "  cwd: /Users/demo/dev/\(project)\(reset)\r\n\r\n"
    }

    private var claudeSlashCommands: [[String: Any]] {
        [
            ["name": "clear", "description": "Clear conversation history and free up context",
             "argumentHint": "", "source": "builtin"],
            ["name": "compact", "description": "Clear history but keep a summary in context",
             "argumentHint": "<summary instructions>", "source": "builtin"],
            ["name": "cost", "description": "Show the total cost of the current session",
             "argumentHint": "", "source": "builtin"],
            ["name": "init", "description": "Initialize a CLAUDE.md file with codebase documentation",
             "argumentHint": "", "source": "builtin"],
            ["name": "memory", "description": "Edit Claude memory files",
             "argumentHint": "", "source": "builtin"],
            ["name": "model", "description": "Set the AI model for Claude Code",
             "argumentHint": "", "source": "builtin"],
            ["name": "review", "description": "Review a pull request",
             "argumentHint": "", "source": "builtin"],
            ["name": "status", "description": "Show version, model, and connectivity",
             "argumentHint": "", "source": "builtin"],
            ["name": "fix-issue", "description": "Fix a numbered GitHub issue",
             "argumentHint": "<issue-number>", "source": "project"],
            ["name": "draft-pr", "description": "Draft a pull request description for this branch",
             "argumentHint": "", "source": "project"],
        ]
    }

    private func treeKey(_ project: String) -> String {
        if let parent = world.project(named: project)?.parentName, !parent.isEmpty {
            return treeKey(parent)
        }
        let known = ["storefront", "api-gateway", "mobile-app", "blog", "design-system"]
        return known.contains(project) ? project : "default"
    }

    private func mentionTree(_ project: String) -> [(String, Bool)] {
        switch treeKey(project) {
        case "storefront":
            return [
                ("app", true), ("app/checkout", true), ("app/layout.tsx", false),
                ("app/page.tsx", false), ("app/checkout/page.tsx", false),
                ("components", true), ("components/CheckoutForm.tsx", false),
                ("components/CartBadge.tsx", false), ("components/Header.tsx", false),
                ("components/ProductCard.tsx", false),
                ("lib", true), ("lib/cart.ts", false), ("lib/payments.ts", false),
                ("lib/products.ts", false),
                ("public", true), ("next.config.mjs", false), ("package.json", false),
                ("README.md", false), ("tsconfig.json", false),
            ]
        case "api-gateway":
            return [
                ("cmd", true), ("cmd/server", true), ("cmd/server/main.go", false),
                ("internal", true), ("internal/routes.go", false),
                ("internal/middleware", true), ("internal/middleware/auth.go", false),
                ("go.mod", false), ("go.sum", false), ("Makefile", false), ("README.md", false),
            ]
        case "mobile-app":
            return [
                ("src", true), ("src/screens", true), ("src/screens/HomeScreen.tsx", false),
                ("src/screens/SettingsScreen.tsx", false),
                ("src/components", true), ("src/components/Button.tsx", false),
                ("App.tsx", false), ("app.json", false), ("package.json", false),
                ("README.md", false),
            ]
        case "blog":
            return [
                ("src", true), ("src/pages", true), ("src/pages/index.astro", false),
                ("src/content", true), ("src/content/posts", true),
                ("src/content/posts/first-post.md", false),
                ("astro.config.mjs", false), ("package.json", false), ("README.md", false),
            ]
        case "design-system":
            return [
                ("src", true), ("src/components", true), ("src/components/Button.tsx", false),
                ("src/components/Button.stories.tsx", false), ("src/tokens.ts", false),
                (".storybook", true), (".storybook/main.ts", false),
                ("package.json", false), ("README.md", false),
            ]
        default:
            return [("src", true), ("package.json", false), ("README.md", false)]
        }
    }

    private func mentionEntries(_ project: String) -> [[String: Any]] {
        let tree = mentionTree(project)
        let treePaths = Set(tree.map(\.0))
        let changed = Set(world.git[project]?.files.map(\.path) ?? [])
        var entries: [[String: Any]] = tree.map {
            ["path": $0.0, "dir": $0.1, "changed": changed.contains($0.0)]
        }
        for path in changed.subtracting(treePaths).sorted() {
            entries.append(["path": path, "dir": false, "changed": true])
        }
        return entries
    }

    private func lsOutput(_ project: String) -> String {
        let top = mentionTree(project).filter { !$0.0.contains("/") && !$0.0.hasPrefix(".") }
        let dirs = top.filter(\.1).map { blueBold + $0.0 + reset }
        let files = top.filter { !$0.1 }.map(\.0)
        return (dirs + files).joined(separator: "  ") + "\r\n"
    }

    private var devLogLines: [String] {
        [
            " \(green)GET\(reset) / \(green)200\(reset) \(dim)in 132ms\(reset)",
            " \(green)GET\(reset) /checkout \(green)200\(reset) \(dim)in 87ms\(reset)",
            " \(green)GET\(reset) /api/products \(green)200\(reset) \(dim)in 45ms\(reset)",
            " \(yellow)POST\(reset) /api/checkout/session \(green)201\(reset) \(dim)in 214ms\(reset)",
            " \(green)GET\(reset) /products/aurora-lamp \(green)200\(reset) \(dim)in 96ms\(reset)",
            " ○ Compiling /checkout ...",
            " ✓ Compiled /checkout \(dim)in 412ms\(reset)",
        ]
    }

    // MARK: shell engine

    private func handleShellInput(_ id: String, _ d: String) {
        guard let term = demoTerminal(id) else { return }
        let prompt = shellPrompt(term.project)
        var pending = term.pendingInput
        var echo = ""
        let chars = Array(d)
        var i = 0
        while i < chars.count {
            let ch = chars[i]
            switch ch {
            case "\u{1B}":
                i += skipEscape(chars, at: i)
                continue
            case "\r", "\n":
                echo += "\r\n"
                let cmd = pending
                pending = ""
                updateTerminal(id) { $0.pendingInput = "" }
                emit(id, echo)
                echo = ""
                runShellCommand(id, cmd)
            case "\u{7F}", "\u{08}":
                if !pending.isEmpty { pending.removeLast(); echo += "\u{08} \u{08}" }
            case "\u{03}":
                pending = ""
                echo += "^C\r\n" + prompt
            default:
                if let v = ch.unicodeScalars.first?.value, v >= 0x20 {
                    pending.append(ch)
                    echo.append(ch)
                }
            }
            i += 1
        }
        updateTerminal(id) { $0.pendingInput = pending }
        if !echo.isEmpty { emit(id, echo) }
    }

    private func runShellCommand(_ id: String, _ raw: String) {
        guard let term = demoTerminal(id) else { return }
        let project = term.project
        let prompt = shellPrompt(project)
        let cmd = raw.trimmingCharacters(in: .whitespaces)
        let word = cmd.split(separator: " ").first.map(String.init) ?? ""
        switch cmd {
        case "":
            emit(id, prompt)
        case "ls", "ls -a", "ls -la", "ll":
            emit(id, lsOutput(project) + prompt)
        case "pwd":
            emit(id, "/Users/demo/dev/\(project)\r\n" + prompt)
        case "whoami":
            emit(id, "demo\r\n" + prompt)
        case "clear":
            setBuffer(id, prompt)
            push(["t": "o", "id": id, "d": "\u{1B}[2J\u{1B}[3J\u{1B}[H" + prompt])
        case "git status":
            emit(id, gitStatusOutput(project) + prompt)
        case "git log":
            emit(id, gitLogOutput(project) + prompt)
        case "npm test", "npm t", "npm run test":
            emit(id, "\r\n> \(project)@0.4.2 test\r\n> vitest run\r\n\r\n")
            emitAfter(1.3, id, testResults() + prompt)
        case "npm run dev":
            emit(id, "\r\n> \(project)@0.4.2 dev\r\n> next dev\r\n\r\n")
            emitAfter(0.9, id, " \(red)⨯\(reset) Port 3000 is already in use\r\n" + prompt)
        case "npm run lint":
            emit(id, "\r\n> \(project)@0.4.2 lint\r\n> next lint\r\n\r\n")
            emitAfter(1.1, id, "\(green)✔\(reset) No ESLint warnings or errors\r\n" + prompt)
        default:
            if word == "claude" {
                emit(id, "\(orange)✻\(reset) Claude Code is already running in the \(bold)Claude\(reset) tab of this project.\r\n" + prompt)
            } else if word == "echo" {
                emit(id, String(cmd.dropFirst(5)) + "\r\n" + prompt)
            } else if word == "git" {
                let sub = cmd.split(separator: " ").dropFirst().first.map(String.init) ?? ""
                emit(id, "git: '\(sub)' is not a git command. See 'git --help'.\r\n" + prompt)
            } else {
                emit(id, "zsh: command not found: \(word)\r\n" + prompt)
            }
        }
    }

    private func testResults() -> String {
        " \(green)✓\(reset) lib/cart.test.ts \(dim)(8 tests) 42ms\(reset)\r\n"
            + " \(green)✓\(reset) lib/payments.test.ts \(dim)(6 tests) 38ms\(reset)\r\n"
            + " \(green)✓\(reset) components/CheckoutForm.test.tsx \(dim)(9 tests) 87ms\(reset)\r\n\r\n"
            + " \(dim)Test Files\(reset)  \(green)3 passed\(reset) (3)\r\n"
            + " \(dim)     Tests\(reset)  \(green)23 passed\(reset) (23)\r\n"
            + " \(dim)  Duration\(reset)  1.24s\r\n\r\n"
    }

    private func gitStatusOutput(_ project: String) -> String {
        guard let r = world.git[project], r.isRepo else {
            return "fatal: not a git repository (or any of the parent directories): .git\r\n"
        }
        var out = "On branch \(r.branch)\r\n"
        if r.ahead > 0, r.hasUpstream {
            out += "Your branch is ahead of 'origin/\(r.branch)' by \(r.ahead) commit\(r.ahead == 1 ? "" : "s").\r\n"
            out += "  (use \"git push\" to publish your local commits)\r\n"
        }
        let staged = r.files.filter { $0.staged || $0.status == "added" }
        let unstaged = r.files.filter { !$0.staged && ["modified", "deleted", "renamed"].contains($0.status) }
        let untracked = r.files.filter { !$0.staged && $0.status == "untracked" }
        if staged.isEmpty, unstaged.isEmpty, untracked.isEmpty {
            return out + "\r\nnothing to commit, working tree clean\r\n"
        }
        func label(_ s: String) -> String {
            switch s {
            case "added": return "new file:   "
            case "deleted": return "deleted:    "
            case "renamed": return "renamed:    "
            default: return "modified:   "
            }
        }
        if !staged.isEmpty {
            out += "\r\nChanges to be committed:\r\n  (use \"git restore --staged <file>...\" to unstage)\r\n"
            for f in staged { out += "\t\(green)\(label(f.status))\(f.path)\(reset)\r\n" }
        }
        if !unstaged.isEmpty {
            out += "\r\nChanges not staged for commit:\r\n  (use \"git add <file>...\" to update what will be committed)\r\n"
            for f in unstaged { out += "\t\(red)\(label(f.status))\(f.path)\(reset)\r\n" }
        }
        if !untracked.isEmpty {
            out += "\r\nUntracked files:\r\n  (use \"git add <file>...\" to include in what will be committed)\r\n"
            for f in untracked { out += "\t\(red)\(f.path)\(reset)\r\n" }
        }
        return out
    }

    private func gitLogOutput(_ project: String) -> String {
        let branch = world.git[project]?.branch ?? "main"
        return "\(yellow)4f2a9c1\(reset) (\(cyan)HEAD -> \(reset)\(green)\(branch)\(reset)) checkout: extract payment helpers\r\n"
            + "\(yellow)8b31d02\(reset) checkout: scaffold two-step form\r\n"
            + "\(yellow)2c9e7aa\(reset) (\(red)origin/main\(reset), \(green)main\(reset)) cart: fix badge count on hydration\r\n"
    }

    private func armDevLog(_ id: String) {
        guard let t = demoTerminal(id), t.cli.isEmpty, !t.logTickArmed else { return }
        updateTerminal(id) { $0.logTickArmed = true }
        scheduleDevLogTick(id)
    }

    private func scheduleDevLogTick(_ id: String) {
        pushAfter(Double.random(in: 4...8)) { [weak self] in
            guard let self, let t = self.demoTerminal(id) else { return nil }
            guard t.subscribed else {
                self.updateTerminal(id) { $0.logTickArmed = false }
                return nil
            }
            self.scheduleDevLogTick(id)
            guard self.world.project(named: t.project)?.running == true else { return nil }
            let chunk = "\r\u{1B}[2K" + self.devLogLines.randomElement()! + "\r\n"
                + self.shellPrompt(t.project) + t.pendingInput
            self.appendBuffer(id, chunk)
            return ["t": "o", "id": id, "d": chunk]
        }
    }

    // MARK: Claude engine

    private func handleClaudeInput(_ id: String, _ d: String) {
        guard let term = demoTerminal(id) else { return }
        guard term.scriptFinished, !term.responding else {
            queueClaudeInput(id, d)
            return
        }
        // A composer submit arrives as a bracketed paste; its embedded CRs are
        // pasted content, not the submit (that CR comes later as its own frame).
        if let start = d.range(of: pasteStart) {
            let tail = d[start.upperBound...]
            let content = tail.range(of: pasteEnd).map { String(tail[..<$0.lowerBound]) } ?? String(tail)
            guard !content.isEmpty else { return }
            updateTerminal(id) { $0.pendingInput += content }
            emit(id, content.replacingOccurrences(of: "\r", with: "\r\n  "))
            return
        }
        var pending = term.pendingInput
        var echo = ""
        let chars = Array(d)
        var i = 0
        while i < chars.count {
            let ch = chars[i]
            switch ch {
            case "\u{1B}":
                i += skipEscape(chars, at: i)
                continue
            case "\r", "\n":
                let submitted = pending
                pending = ""
                updateTerminal(id) { $0.pendingInput = "" }
                if !echo.isEmpty { emit(id, echo); echo = "" }
                if submitted.isEmpty { break }
                claudeRespond(id)
                return
            case "\u{7F}", "\u{08}":
                if !pending.isEmpty { pending.removeLast(); echo += "\u{08} \u{08}" }
            default:
                if let v = ch.unicodeScalars.first?.value, v >= 0x20 {
                    pending.append(ch)
                    echo.append(ch)
                }
            }
            i += 1
        }
        updateTerminal(id) { $0.pendingInput = pending }
        if !echo.isEmpty { emit(id, echo) }
    }

    private func queueClaudeInput(_ id: String, _ d: String) {
        guard let term = demoTerminal(id) else { return }
        var queued = term.queuedInput
        var submit = term.queuedSubmit
        let chars = Array(d)
        var i = 0
        while i < chars.count {
            let ch = chars[i]
            switch ch {
            case "\u{1B}":
                i += skipEscape(chars, at: i)
                continue
            case "\r", "\n":
                if !queued.isEmpty { submit = true }
            case "\u{7F}", "\u{08}":
                if !queued.isEmpty { queued.removeLast() }
            default:
                if let v = ch.unicodeScalars.first?.value, v >= 0x20 { queued.append(ch) }
            }
            i += 1
        }
        updateTerminal(id) { $0.queuedInput = queued; $0.queuedSubmit = submit }
    }

    private func flushQueuedClaude(_ id: String) {
        guard let term = demoTerminal(id), !term.queuedInput.isEmpty || term.queuedSubmit
        else { return }
        let queued = term.queuedInput
        let submit = term.queuedSubmit
        updateTerminal(id) { $0.queuedInput = ""; $0.queuedSubmit = false }
        guard !queued.isEmpty else { return }
        emit(id, queued)
        if submit { claudeRespond(id) }
        else { updateTerminal(id) { $0.pendingInput = queued } }
    }

    private var claudeAcks: [String] {
        [
            "\(textDot) Noted — I'll fold that into the checkout work. The payment logic stays in \(bold)lib/payments.ts\(reset), so it's a small, contained change.",
            "\(textDot) Good call. I'll adjust the checkout steps to cover that and re-run the tests to make sure nothing regresses.",
            "\(textDot) Got it — I'll take a look and keep the changes scoped to the checkout flow.",
        ]
    }

    private func claudeRespond(_ id: String) {
        guard let term = demoTerminal(id) else { return }
        let project = term.project
        let ack = claudeAcks[term.ackCount % claudeAcks.count]
        updateTerminal(id) { $0.responding = true; $0.ackCount += 1 }
        demoSetAgentStatus(project: project, entries: [statusEntry(id, "Running", 10)])
        emit(id, "\r\n")
        pushAfter(1.1) { [weak self] in
            guard let self, self.demoTerminal(id) != nil else { return nil }
            let text = ack + "\r\n\r\n\(bold)>\(reset) "
            self.appendBuffer(id, text)
            self.updateTerminal(id) { $0.responding = false }
            self.demoSetAgentStatus(project: project, entries: [self.statusEntry(id, "Waiting", 30)])
            self.push(["t": "o", "id": id, "d": text])
            self.flushQueuedClaude(id)
            return nil
        }
    }

    private func startClaudeScript(_ id: String) {
        guard let term = demoTerminal(id), !term.scriptStarted else { return }
        updateTerminal(id) { $0.scriptStarted = true }
        let project = term.project
        demoSetAgentStatus(project: project, entries: [statusEntry(id, "Running", 10)])
        let steps = claudeScriptSteps()
        for (i, step) in steps.enumerated() {
            let last = i == steps.count - 1
            pushAfter(step.0) { [weak self] in
                guard let self, self.demoTerminal(id) != nil else { return nil }
                self.appendBuffer(id, step.1)
                guard last else { return ["t": "o", "id": id, "d": step.1] }
                self.updateTerminal(id) { $0.scriptFinished = true }
                self.demoSetAgentStatus(project: project,
                                        entries: [self.statusEntry(id, "Waiting", 30)])
                self.push(["t": "o", "id": id, "d": step.1])
                self.flushQueuedClaude(id)
                return nil
            }
        }
    }

    private func claudeScriptSteps() -> [(Double, String)] {
        [
            (0.9, "\(dim)> Implement the checkout redesign: split the form into shipping and payment steps, and move the payment logic into lib/payments.ts\(reset)\r\n\r\n"),
            (2.6, "\(textDot) I'll look at the current checkout implementation first.\r\n\r\n"),
            (4.8, "\(toolDot) \(bold)Read\(reset)(app/checkout/page.tsx)\r\n  \(dim)⎿  Read 148 lines\(reset)\r\n\r\n"),
            (7.2, "\(toolDot) \(bold)Read\(reset)(components/CheckoutForm.tsx)\r\n  \(dim)⎿  Read 214 lines\(reset)\r\n\r\n"),
            (10.5, "\(textDot) The form validates and charges the card inline. I'll extract that into a new lib/payments.ts module, then split the form into a shipping step and a payment step.\r\n\r\n"),
            (14.0, "\(toolDot) \(bold)Write\(reset)(lib/payments.ts)\r\n  \(dim)⎿  Created lib/payments.ts with 86 lines\(reset)\r\n\r\n"),
            (18.5, "\(toolDot) \(bold)Update\(reset)(components/CheckoutForm.tsx)\r\n  \(dim)⎿  Updated components/CheckoutForm.tsx with 42 additions and 18 removals\(reset)\r\n     \(red)-  const charge = await fetch(\"/api/charge\", …)\(reset)\r\n     \(green)+  const intent = await createPaymentIntent(cart)\(reset)\r\n\r\n"),
            (23.0, "\(toolDot) \(bold)Update\(reset)(app/checkout/page.tsx)\r\n  \(dim)⎿  Updated app/checkout/page.tsx with 9 additions and 3 removals\(reset)\r\n\r\n"),
            (27.5, "\(toolDot) \(bold)Bash\(reset)(npm test)\r\n  \(dim)⎿  3 test files, 23 tests passed (1.2s)\(reset)\r\n\r\n"),
            (31.0, "\(toolDot) \(bold)Update\(reset)(README.md)\r\n  \(dim)⎿  Updated README.md with 6 additions\(reset)\r\n\r\n"),
            (35.0, "\(textDot) Done — checkout is now a two-step flow:\r\n\r\n  • \(bold)lib/payments.ts\(reset) — payment intent creation and card validation\r\n  • \(bold)components/CheckoutForm.tsx\(reset) — shipping and payment steps\r\n  • \(bold)app/checkout/page.tsx\(reset) — wires up the step state\r\n  • \(bold)README.md\(reset) — documents the new flow\r\n\r\n  All 23 tests pass. Want me to update the cart badge to match the new flow?\r\n\r\n"),
            (37.0, "\u{1B}[?2004h\(dim)────────────────────────────────────\(reset)\r\n\(bold)>\(reset) "),
        ]
    }

    // MARK: transform engine

    private func demoRewrites(_ text: String, instruction: String, count: Int) -> [String] {
        let base = polishPrompt(text)
        let lc = instruction.lowercased()
        let variants: [String]
        if lc.contains("short") || lc.contains("concise") {
            variants = [
                firstSentence(dropFiller(base)),
                dropFiller(base),
                truncateWords(base, 10),
                firstSentence(base),
                truncateWords(dropFiller(base), 8),
            ]
        } else if lc.contains("grammar") || lc.contains("spell") {
            variants = [base, expandContractions(base), base, expandContractions(base), base]
        } else if lc.contains("detail") || lc.contains("longer") || lc.contains("expand") {
            variants = [
                base + " Include unit tests for the new behavior.",
                base + " Outline the approach first, then implement it step by step.",
                base + " List any edge cases you find along the way.",
                base + " Update related documentation to match.",
                base + " Note every file you touch in a short summary at the end.",
            ]
        } else {
            variants = [
                base,
                base + " Keep the changes minimal and focused.",
                base + " Explain your reasoning as you go.",
                base + " Break it into small, reviewable steps.",
                base + " Add tests where behavior changes.",
            ]
        }
        return (0..<count).map { variants[$0 % variants.count] }
    }

    private func polishPrompt(_ text: String) -> String {
        var s = text.replacingOccurrences(of: "\n", with: " ")
        while s.contains("  ") { s = s.replacingOccurrences(of: "  ", with: " ") }
        s = s.trimmingCharacters(in: .whitespacesAndNewlines)
        var stripped = true
        while stripped {
            stripped = false
            for prefix in ["can you ", "could you ", "please ", "i want you to ", "i'd like you to ", "hey "]
            where s.lowercased().hasPrefix(prefix) {
                s = String(s.dropFirst(prefix.count))
                stripped = true
            }
        }
        guard !s.isEmpty else { return "Rewrite this." }
        s = s.prefix(1).uppercased() + s.dropFirst()
        s = s.replacingOccurrences(of: " i ", with: " I ")
        if let last = s.last, !".!?".contains(last) { s += "." }
        return s
    }

    private func dropFiller(_ s: String) -> String {
        let filler: Set<String> = ["just", "really", "very", "basically", "actually", "maybe", "perhaps", "simply"]
        let words = s.split(separator: " ").filter { !filler.contains($0.lowercased()) }
        return words.joined(separator: " ")
    }

    private func firstSentence(_ s: String) -> String {
        if let r = s.range(of: ". ") { return String(s[..<r.lowerBound]) + "." }
        return s
    }

    private func truncateWords(_ s: String, _ n: Int) -> String {
        let words = s.split(separator: " ")
        guard words.count > n else { return s }
        return words.prefix(n).joined(separator: " ") + "…"
    }

    private func expandContractions(_ s: String) -> String {
        var out = s
        for (a, b) in [("don't", "do not"), ("Don't", "Do not"), ("can't", "cannot"),
                       ("won't", "will not"), ("it's", "it is"), ("It's", "It is"),
                       ("doesn't", "does not"), ("isn't", "is not"), ("let's", "let us"),
                       ("I'm", "I am"), ("we're", "we are")] {
            out = out.replacingOccurrences(of: a, with: b)
        }
        return out
    }

    // MARK: helpers

    private func statusEntry(_ key: String, _ value: String, _ priority: Int) -> [String: Any] {
        ["key": key, "value": value, "priority": priority,
         "timestamp": Int(Date().timeIntervalSince1970 * 1000)]
    }

    private func fileExt(_ mime: String) -> String {
        switch mime {
        case "image/jpeg": return "jpg"
        case "image/png": return "png"
        case "image/gif": return "gif"
        case "image/heic": return "heic"
        case "application/pdf": return "pdf"
        default: return "bin"
        }
    }

    private func skipEscape(_ chars: [Character], at i: Int) -> Int {
        guard i + 1 < chars.count else { return 1 }
        if chars[i + 1] == "[" {
            var j = i + 2
            while j < chars.count {
                if let v = chars[j].unicodeScalars.first?.value, (0x40...0x7E).contains(v) {
                    return j - i + 1
                }
                j += 1
            }
            return chars.count - i
        }
        if chars[i + 1] == "]" {
            var j = i + 2
            while j < chars.count, chars[j] != "\u{07}" { j += 1 }
            return min(j + 1, chars.count) - i
        }
        return 2
    }

    private func emit(_ id: String, _ text: String) {
        appendBuffer(id, text)
        push(["t": "o", "id": id, "d": text])
    }

    private func emitAfter(_ delay: Double, _ id: String, _ text: String) {
        pushAfter(delay) { [weak self] in
            guard let self, self.demoTerminal(id) != nil else { return nil }
            self.appendBuffer(id, text)
            return ["t": "o", "id": id, "d": text]
        }
    }

    private func appendBuffer(_ id: String, _ text: String) {
        updateTerminal(id) { t in
            t.buffer += text
            if t.buffer.count > 24_000 {
                var trimmed = String(t.buffer.suffix(20_000))
                if let nl = trimmed.range(of: "\r\n") { trimmed = String(trimmed[nl.upperBound...]) }
                t.buffer = trimmed
            }
        }
    }

    private func setBuffer(_ id: String, _ text: String) {
        updateTerminal(id) { $0.buffer = text }
    }

    private func demoTerminal(_ id: String) -> DemoWorld.Terminal? {
        world.terminals.values.flatMap { $0 }.first { $0.id == id }
    }

    private func updateTerminal(_ id: String, _ mutate: (inout DemoWorld.Terminal) -> Void) {
        for (project, var list) in world.terminals {
            if let idx = list.firstIndex(where: { $0.id == id }) {
                mutate(&list[idx])
                world.terminals[project] = list
                return
            }
        }
    }
}

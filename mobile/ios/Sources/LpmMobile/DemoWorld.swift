import Foundation

/// All mutable state of the simulated Mac behind Demo Mode, grouped per domain.
/// Authored once here by the foundation; the domain handlers (`DemoProjects`,
/// `DemoTerminals`, …) read and mutate these values and turn them into wire frames
/// through the dictionary builders below. Plain value types held on `DemoServer`
/// as a single `var world`, mutated only on the main queue.
struct DemoWorld {
    // MARK: Projects

    struct Svc {
        var name: String
        var cmd: String
        var port: Int
        var running: Bool
    }

    struct Profile {
        var name: String
        var services: [String]
    }

    struct Status {
        var key: String
        var value: String   // Running | Done | Waiting | Error
        var priority: Int
        var timestamp: Int  // unix millis
        var paneID: String  // the terminal reporting it
        var turnStart = 0   // unix millis; 0 when never seen starting
        var endedAt = 0     // unix millis; 0 while it runs
        var seenAt = 0      // unix millis; only on a seen agent
    }

    struct Project {
        var name: String
        var label: String
        var running: Bool
        var isRemote: Bool = false
        var parentName: String = ""
        var worktree: Bool = false
        // The person-set work status, as the raw wire dict the Mac would send.
        var workStatus: [String: Any]? = nil
        var autoPull: Bool? = nil
        // The project's own Claude account keys, as its YAML would hold them.
        var claudeAccount: String? = nil
        var claudeAccounts: [String]? = nil
        var services: [Svc] = []
        var profiles: [Profile] = []
        var activeProfile: String = ""
        // Action mappings kept as raw wire dicts — the shape is recursive and
        // largely inert data, so structuring it would only add friction.
        var actions: [[String: Any]] = []
        // Zones as the Mac sends them (ZoneInfo), sorted by position.
        var zones: [[String: Any]] = []
        var status: [Status] = []
        // Finished agents already opened, kept until archived.
        var seen: [Status] = []
    }

    var projects: [Project] = []
    var claude = ClaudeDemo()

    struct BgRunLine {
        var at: Double
        var text: String
    }

    struct BgRun {
        var runId: String
        var project: String
        var label: String
        var startedAt: Int
        var startedRef: Double
        var duration: Double
        var lines: [BgRunLine]
        var cancelledAt: Double? = nil
    }

    // In-flight + recently finished background action runs (reaped after ~5 min,
    // mirroring the desktop registry's retention).
    var backgroundRuns: [BgRun] = []
    var limitReminders: [[String: Any]] = []
    // Poll counters ("project\nservice") so service logs grow between polls.
    var serviceLogTicks: [String: Int] = [:]
    var serviceLogWatches: [String: Int] = [:]   // project + "\n" + pane -> watch token
    var serviceLogWatchSeq = 0

    // MARK: Sidebar

    struct Folder {
        var id: String
        var name: String
        var collapsed: Bool
        var members: [String]
    }

    var sidebarOrder: [String] = []
    var folders: [Folder] = []

    // The desktop's persisted duplicate-modal toggle defaults.
    var duplicateExcludeUncommitted = false
    var duplicateReinstallDeps = false
    var duplicatePullLatest = true

    // MARK: Terminals

    /// The title the demo's Claude conversation would have; a tab that doesn't
    /// show it offers "Use Conversation Title".
    static let conversationTitle = "Two-step checkout"

    struct Terminal {
        var id: String
        var label: String
        var project: String
        var cols: Int = 80
        var rows: Int = 24
        var remote: Bool = false
        var pinned: Bool = false
        var emoji: String = ""
        var cli: String = ""
        // Recent scrollback replayed on subscribe; the terminal engine appends to it.
        var buffer: String = ""
        // Set once a per-terminal live script (dev log / Claude session) has begun,
        // so a re-subscribe doesn't replay it from the start.
        var scriptStarted = false
        var scriptFinished = false
        var subscribed = false
        var pendingInput = ""
        // Input submitted while the Claude script or an ack is still streaming,
        // replayed at the next idle prompt instead of being dropped.
        var queuedInput = ""
        var queuedSubmit = false
        var logTickArmed = false
        var responding = false
        var ackCount = 0
        // Its shell ran `exit`: the tab stays, as on the Mac, until it is restarted.
        var exited = false
    }

    var terminals: [String: [Terminal]] = [:] // project -> terminals
    // "<provider>:<sessionId>" -> the tab holding that conversation.
    var sessionTabs: [String: String] = ["claude:7c1e4f2a-tax": "demo-storefront-claude"]

    struct AgentAnswer {
        var text: String
        var at: Int // unix millis
    }

    // Terminal id -> the answers its scripted agent has printed, oldest first, as
    // the markdown a real transcript would hold.
    var agentAnswers: [String: [AgentAnswer]] = [:]

    struct ComposerDraft {
        var text: String
        var rev: Int
    }

    // Mirrored composer drafts keyed by terminal id. `composerDraftRev` is globally
    // monotonic (like the Mac hub's) so a re-typed draft always outranks a prior one.
    var composerDrafts: [String: ComposerDraft] = [:]
    var composerDraftRev = 0
    var uploadNames: [String: String] = [:] // chunked uploadId -> file name

    // MARK: Git

    struct GitFile {
        var path: String
        var status: String   // added | deleted | renamed | modified | untracked
        var staged: Bool = false
        var stamp: String
        var diff: String = ""
    }

    struct GitBranch {
        var name: String
        var committerDate: String
        var remote: String = ""
    }

    struct GitRepo {
        var isRepo: Bool = true
        var branch: String
        var detached: Bool = false
        var hasUpstream: Bool = true
        var ahead: Int = 0
        var behind: Int = 0
        var defaultBranch: String = "main"
        var ghCli: Bool = true
        var files: [GitFile] = []
        var branches: [GitBranch] = []
        var watched: Bool = false
        // Per-branch ahead counts so a checkout restores the branch it left.
        var aheadByBranch: [String: Int] = [:]
        // The last auto pull, as the raw wire dict, while it can be undone.
        var autoPulled: [String: Any]? = nil
    }

    var git: [String: GitRepo] = [:] // project -> repo
    var gitAutoRuns: [String: GitAutoRun] = [:] // project -> last Auto Commit / PR run
    var gitAutoNextId = 1

    // MARK: Jobs (automations)

    struct JobRun {
        var at: Int
        var result: String
        var count: Int = 1
        var copy: String = ""
        var output: String = ""
        var durationSecs: Int? = nil
        var costUsd: Double? = nil
        var question: String = ""
        var session: String = ""
        var resumed: String = ""
        var follows: Int? = nil
        // Questions the run put to the user, in the Mac's JobAsk shape.
        var asks: [[String: Any]] = []
        var answerTo: String = ""
    }

    struct Job {
        var id: String
        var project: String
        var label: String
        var emoji: String = ""
        var enabled: Bool = true
        var source: String = "project"
        var duplicate: Bool = false
        var runKind: String = "cmd"        // action | cmd | prompt
        var summary: String = ""           // the prompt, command, or action name
        var scheduleMode: String = "calendar" // interval | calendar
        var everySecs: Int = 0
        var everyMaxSecs: Int = 0
        var atMinutes: Int = 0
        var untilMinutes: Int? = nil
        var times: Int = 1
        var days: [String] = []
        var pickDays: Int = 0
        var lastRunAt: Int? = nil
        var lastResult: String = ""
        var nextFireAt: Int? = nil
        var running: Bool = false
        var runningSince: Int? = nil
        var agent: String = ""
        var model: String = ""
        var effort: String = ""
        var history: [JobRun] = []
        // Live output of an in-flight simulated run (nil when idle).
        var liveStartedAt: Int? = nil
        var liveText: String = ""
        // The stored YAML-shaped body (label/emoji/schedule/run/…) the editor
        // round-trips through jobConfig/saveJob.
        var body: [String: Any] = [:]
        // Bumped on every run start so a stopped run's stale timers no-op.
        var runSeq: Int = 0
        // When this automation was last read: runs after it are the unread ones.
        var seenAt: Int = 0
    }

    var jobs: [Job] = []

    // MARK: Config

    // Raw YAML per "<project>\n<layer>" (layer ∈ project|repo|global). A missing
    // key reads back as an empty, available layer.
    var configText: [String: String] = [:]

    // Managed service fields the typed `Svc` can't hold (cwd, portConflict, env,
    // dependsOn), keyed "<project>\n<service>", so structured edits round-trip.
    var serviceExtras: [String: [String: Any]] = [:]

    // MARK: History (message history screen)

    struct HistoryMessage {
        var id: String
        var text: String
        var timestamp: Int   // unix millis
        var favorite: Bool = false
        var folder: String? = nil
        var kind: String = "sent"
        var project: String
        var at: Int
        var seq: Int
    }

    var historyMessages: [HistoryMessage] = []

    struct HistoryFolder {
        var id: String
        var name: String
    }

    var historyFolders: [HistoryFolder] = []

    // MARK: Session memory

    struct MemoryDoc {
        var name: String
        var title: String
        var content: String
        var updatedAt: Int   // unix SECONDS — every Notes timestamp below is millis
    }

    // Session logs keyed by the folder that owns them, which for a duplicate is
    // its original's. A missing key is the empty state (`exists: false`); an empty
    // array is a folder whose logs were all deleted.
    var memoryDocs: [String: [MemoryDoc]] = [:]

    // MARK: Notes

    struct NoteAttachmentRec {
        var hash: String
        var name: String
        var size: Int
        var mimeType: String
    }

    struct NoteRec {
        var id: String
        var chatId: String
        // Paging order: `beforeId` resolves to a seq and older notes are the ones
        // below it. Ids stay opaque on the wire.
        var seq: Int
        var ts: Int          // unix millis
        var text: String
        var editedAt: Int? = nil
        var attachments: [NoteAttachmentRec] = []
    }

    struct NoteChatRec {
        var id: String
        var title: String
        var createdAt: Int   // unix millis
        var updatedAt: Int   // unix millis
    }

    var noteChats: [String: [NoteChatRec]] = [:]   // project -> chats
    var noteMessages: [String: [NoteRec]] = [:]    // project -> notes across its chats
    var noteBlobs: [String: String] = [:]          // attachment hash -> base64 bytes
    var noteSeq = 0

    // MARK: seed

    init() {
        let nowMs = Int(Date().timeIntervalSince1970 * 1000)
        let nowS = Int(Date().timeIntervalSince1970)
        seedProjects()
        seedSidebar()
        seedTerminals()
        seedGit(nowS: nowS)
        seedJobs(nowS: nowS)
        seedConfig()
        seedHistory(nowMs: nowMs)
        seedSeenAgents(nowMs: nowMs)
    }

    private mutating func seedProjects() {
        func action(_ name: String, _ label: String, _ cmd: String, display: String? = nil) -> [String: Any] {
            var action: [String: Any] = ["name": name, "label": label, "type": "command", "cmd": cmd]
            action["display"] = display
            return action
        }
        func agent(_ name: String, _ label: String, _ cmd: String, layer: String, color: String) -> [String: Any] {
            ["name": name, "label": label, "type": "terminal", "cmd": cmd, "color": color,
             "display": "agents", "layer": layer]
        }
        projects = [
            Project(
                name: "storefront", label: "storefront", running: true,
                services: [
                    Svc(name: "web", cmd: "npm run dev", port: 3000, running: true),
                    Svc(name: "api", cmd: "npm run api", port: 4000, running: true),
                    Svc(name: "worker", cmd: "npm run worker", port: 0, running: false),
                ],
                actions: [action("test", "Test", "npm test", display: "checks"),
                          action("lint", "Lint", "npm run lint", display: "checks"),
                          agent("fix-tests", "Fix tests", "claude \"Fix the failing tests\"",
                                layer: "claude", color: "claude"),
                          agent("review", "Review", "claude \"Review my changes\"",
                                layer: "claude", color: "claude"),
                          agent("codex-review", "Review", "codex \"Review my changes\"",
                                layer: "codex", color: "cyan")],
                zones: [["name": "checks", "label": "Checks", "rows": 1, "display": "header",
                         "position": 1, "source": "project"],
                        ["name": "agents", "label": "Agents", "rows": 2, "display": "header",
                         "position": 2, "source": "project",
                         "layers": [["name": "claude", "label": "Claude", "position": 1],
                                    ["name": "codex", "label": "Codex", "position": 2]]]]
            ),
            Project(
                name: "api-gateway", label: "api-gateway", running: false,
                services: [Svc(name: "server", cmd: "go run ./cmd/server", port: 8080, running: false)],
                actions: [["name": "test", "label": "Test", "type": "background",
                           "cmd": "go test ./..."],
                          ["name": "release", "label": "🚀 Release · v2.4.1 · 3d ago",
                           "configLabel": "🚀 Release · {{git.tag}} · {{git.tagAge}}",
                           "type": "background", "cmd": "./scripts/release.sh", "confirm": true]]
            ),
            Project(
                name: "mobile-app", label: "mobile-app", running: false,
                claudeAccounts: ["work", claudeMainLogin],
                services: [Svc(name: "metro", cmd: "npm start", port: 8081, running: false)],
                actions: [["name": "clean", "label": "Clear caches", "type": "background",
                           "cmd": "npm run clean", "confirm": true]]
            ),
            Project(
                name: "blog", label: "blog", running: false,
                services: [Svc(name: "dev", cmd: "npm run dev", port: 4321, running: false)],
                actions: [["name": "new-post", "label": "New post", "type": "background",
                           "cmd": "npm run new-post -- \"{{title}}\"",
                           "inputs": [["key": "title", "label": "Title", "required": true,
                                       "placeholder": "Post title"]]]]
            ),
            Project(
                name: "design-system", label: "design-system", running: false,
                autoPull: false,
                claudeAccount: "work",
                services: [Svc(name: "storybook", cmd: "npm run storybook", port: 6006, running: false)]
            ),
        ]
    }

    private mutating func seedSidebar() {
        folders = [Folder(id: "client-work", name: "Client Work", collapsed: false,
                          members: ["blog", "design-system"])]
        sidebarOrder = ["storefront", "api-gateway", "mobile-app", "group:client-work"]
    }

    private mutating func seedTerminals() {
        terminals["storefront"] = [
            Terminal(id: "demo-storefront-1", label: "Terminal 1", project: "storefront",
                     buffer: "~/dev/storefront $ "),
            Terminal(id: "demo-storefront-claude", label: "Claude", project: "storefront",
                     emoji: "✻", cli: "claude",
                     buffer: "Welcome to Claude Code\r\n\r\n"),
        ]
    }

    private mutating func seedGit(nowS: Int) {
        func date(_ daysAgo: Int) -> String {
            let f = ISO8601DateFormatter()
            return f.string(from: Date(timeIntervalSince1970: Double(nowS - daysAgo * 86400)))
        }
        git["storefront"] = GitRepo(
            branch: "feat/checkout-redesign", ahead: 2, behind: 0,
            files: [
                GitFile(path: "components/CheckoutForm.tsx", status: "modified", stamp: "s1"),
                GitFile(path: "app/checkout/page.tsx", status: "modified", stamp: "s2"),
                GitFile(path: "lib/payments.ts", status: "added", stamp: "s3"),
                GitFile(path: "README.md", status: "modified", stamp: "s4"),
            ],
            branches: [
                GitBranch(name: "feat/checkout-redesign", committerDate: date(0)),
                GitBranch(name: "main", committerDate: date(3)),
                GitBranch(name: "fix/cart-badge", committerDate: date(5)),
                GitBranch(name: "main", committerDate: date(3), remote: "origin"),
            ]
        )
        for name in ["api-gateway", "mobile-app", "blog", "design-system"] {
            git[name] = GitRepo(branch: "main",
                                branches: [GitBranch(name: "main", committerDate: date(7)),
                                           GitBranch(name: "main", committerDate: date(7), remote: "origin")])
        }
        git["api-gateway"]?.autoPulled = ["count": 3, "branch": "main", "from": "4f1c2ab", "to": "9e7d031",
                                          "at": (nowS - 25 * 60) * 1000]
    }

    private mutating func seedJobs(nowS: Int) {
        let cal = Calendar.current
        let now = Date(timeIntervalSince1970: TimeInterval(nowS))
        let anchor = cal.date(bySettingHour: 3, minute: 0, second: 0, of: now) ?? now
        let lastNight = anchor <= now ? anchor : (cal.date(byAdding: .day, value: -1, to: anchor) ?? anchor)
        let t0 = Int(lastNight.timeIntervalSince1970)

        let passOutput = """
         ✓ lib/payments.test.ts (12 tests) 267ms
         ✓ components/CheckoutForm.test.tsx (8 tests) 412ms
         ✓ app/checkout/page.test.tsx (5 tests) 638ms

         Test Files  3 passed (3)
              Tests  25 passed (25)
           Duration  6.9s
        """
        let failOutput = """
         ✓ lib/payments.test.ts (12 tests) 271ms
         ✗ components/CheckoutForm.test.tsx (8 tests | 1 failed) 460ms
           → expected discount total to equal 41.98, got 45.98
         ✓ app/checkout/page.test.tsx (5 tests) 655ms

         Test Files  1 failed | 2 passed (3)
              Tests  1 failed | 24 passed (25)
           Duration  7.2s
        """
        let rerunOutput = """
         ✓ lib/payments.test.ts (12 tests) 259ms
         ✓ components/CheckoutForm.test.tsx (8 tests) 405ms
         ✓ app/checkout/page.test.tsx (5 tests) 641ms

         Test Files  3 passed (3)
              Tests  25 passed (25)
           Duration  6.7s
        """

        jobs = [
            Job(id: "nightly-tests", project: "storefront", label: "Nightly tests", emoji: "🌙",
                enabled: true, runKind: "cmd", summary: "npm test",
                scheduleMode: "calendar", atMinutes: 180,
                lastRunAt: t0, lastResult: "completed", nextFireAt: t0 + 86400,
                history: [
                    JobRun(at: t0 - 2 * 86400, result: "error", output: failOutput, durationSecs: 61),
                    JobRun(at: t0 - 2 * 86400 + 1560, result: "completed", output: rerunOutput,
                           durationSecs: 70),
                    JobRun(at: t0 - 86400, result: "completed", output: passOutput, durationSecs: 69),
                    JobRun(at: t0, result: "completed", output: passOutput, durationSecs: 72),
                ],
                body: [
                    "label": "Nightly tests",
                    "emoji": "🌙",
                    "schedule": ["at": "03:00"],
                    "run": ["cmd": "npm test"],
                ],
                // Read up to the night before, so the demo opens with last
                // night's run still waiting to be looked at.
                seenAt: t0 - 1),
            Job(id: "release-notes", project: "blog", label: "Release notes", emoji: "📝",
                enabled: true, runKind: "prompt",
                summary: "Draft release notes from this week's merged pull requests, then ask before publishing them.",
                scheduleMode: "calendar", atMinutes: 1020, days: ["fri"],
                lastRunAt: t0 - 3600, lastResult: "completed", nextFireAt: t0 + 6 * 86400,
                agent: "claude",
                history: [
                    JobRun(at: t0 - 3600, result: "completed",
                           output: "Drafted the notes for v2.4: 9 merged pull requests, grouped into Features and Fixes. They're ready to go out once you say so.",
                           durationSecs: 94, costUsd: 0.21, session: "demo-release-notes",
                           asks: [[
                               "id": "release-notes-v24", "askedAt": t0 - 3600, "status": "open",
                               "questions": [[
                                   "id": "q1", "type": "confirm",
                                   "text": "Publish the v2.4 release notes to the blog?",
                                   "yes": "Publish", "no": "Not yet",
                               ]],
                           ]]),
                ],
                body: [
                    "label": "Release notes",
                    "emoji": "📝",
                    "schedule": ["at": "17:00", "days": ["fri"]],
                    "run": [
                        "prompt": "Draft release notes from this week's merged pull requests, then ask before publishing them.",
                        "agent": "claude",
                    ],
                ]),
            Job(id: "weekly-deps", project: "blog", label: "Weekly dependency check", emoji: "📦",
                enabled: false, runKind: "prompt",
                summary: "Check the project's dependencies for outdated packages and summarize which updates are safe to apply.",
                scheduleMode: "calendar", atMinutes: 360,
                days: ["mon"], lastResult: "", agent: "claude",
                body: [
                    "label": "Weekly dependency check",
                    "emoji": "📦",
                    "schedule": ["at": "06:00", "days": ["mon"]],
                    "run": [
                        "prompt": "Check the project's dependencies for outdated packages and summarize which updates are safe to apply.",
                        "agent": "claude",
                    ],
                ]),
        ]
    }

    private mutating func seedConfig() {
        configText["storefront\nproject"] = """
        services:
          web:
            cmd: npm run dev
            port: 3000
          api:
            cmd: npm run api
            port: 4000
          worker:
            cmd: npm run worker
        actions:
          test:
            cmd: npm test
            display: checks
          lint:
            cmd: npm run lint
            display: checks
          fix-tests:
            label: Fix tests
            cmd: claude "Fix the failing tests"
            type: terminal
            color: claude
            display: agents
            layer: claude
          review:
            label: Review
            cmd: claude "Review my changes"
            type: terminal
            color: claude
            display: agents
            layer: claude
          codex-review:
            label: Review
            cmd: codex "Review my changes"
            type: terminal
            color: cyan
            display: agents
            layer: codex
        zones:
          checks:
            rows: 1
            label: Checks
            position: 1
          agents:
            rows: 2
            label: Agents
            position: 2
            layers:
              claude:
                label: Claude
                position: 1
              codex:
                label: Codex
                position: 2
        """
    }

    private mutating func seedHistory(nowMs: Int) {
        historyMessages = [
            HistoryMessage(id: "h1", text: "Refactor the checkout form validation",
                           timestamp: nowMs - 3_600_000, favorite: true,
                           project: "storefront", at: nowMs - 3_600_000, seq: 3),
            HistoryMessage(id: "h2", text: "Add unit tests for the payments module",
                           timestamp: nowMs - 7_200_000,
                           project: "storefront", at: nowMs - 7_200_000, seq: 2),
            HistoryMessage(id: "h3", text: "Update the README with setup steps",
                           timestamp: nowMs - 90_000_000,
                           project: "blog", at: nowMs - 90_000_000, seq: 1),
        ]
    }
}

// MARK: - Wire-frame builders
//
// Turn the structured world above into the `[String: Any]` payloads the phone
// decodes (shapes mirror `Wire.Inbound.parse` in LpmProtocol.swift). Shared by
// every domain handler so the mapping lives in one place.

extension DemoWorld {
    func project(named name: String) -> Project? { projects.first { $0.name == name } }
    func projectIndex(_ name: String) -> Int? { projects.firstIndex { $0.name == name } }

    func serviceDict(_ s: Svc) -> [String: Any] {
        ["name": s.name, "cmd": s.cmd, "port": s.port]
    }

    func statusDict(_ s: Status) -> [String: Any] {
        var d: [String: Any] = ["key": s.key, "value": s.value, "priority": s.priority,
                                "timestamp": s.timestamp, "paneID": s.paneID]
        if s.turnStart > 0 { d["turnStart"] = s.turnStart }
        if s.endedAt > 0 { d["endedAt"] = s.endedAt }
        if s.seenAt > 0 { d["seenAt"] = s.seenAt }
        return d
    }

    func projectDict(_ p: Project) -> [String: Any] {
        var d: [String: Any] = [
            "name": p.name,
            "label": p.label,
            "running": p.running,
            "isRemote": p.isRemote,
            "parentName": p.parentName,
            "worktree": p.worktree,
            "statusEntries": p.status.map(statusDict),
            "seenEntries": p.seen.map(statusDict),
            "services": p.services.filter(\.running).map(serviceDict),
            "allServices": p.services.map(serviceDict),
            "profiles": p.profiles.map { ["name": $0.name, "services": $0.services] },
            "activeProfile": p.activeProfile,
            "actions": p.actions,
            "zones": p.zones,
        ]
        if let ws = p.workStatus { d["workStatus"] = ws }
        if let autoPull = p.autoPull { d["autoPull"] = autoPull }
        if let account = p.claudeAccount { d["claudeAccount"] = account }
        if let accounts = p.claudeAccounts { d["claudeAccounts"] = accounts }
        return d
    }

    func projectsPayload() -> [String: Any] {
        // The palette a Mac starts with, plus one the demo user added.
        let palette = defaultWorkStatusPalette + [CustomWorkStatus(label: "QA", emoji: "🧪")]
        return [
            "t": "projects",
            "projects": projects.map(projectDict),
            "workStatuses": palette.map { ["label": $0.label, "emoji": $0.emoji, "withNote": $0.withNote] },
            "workStatusOrder": [String](),
            "autoPullMode": "all",
            "seenAgentsShown": 3,
            "keepFinishedAgents": true,
        ]
    }

    func sidebarPayload() -> [String: Any] {
        [
            "t": "sidebar",
            "order": sidebarOrder,
            "groups": folders.map {
                ["id": $0.id, "name": $0.name, "collapsed": $0.collapsed, "members": $0.members]
            },
        ]
    }

    func statusPayload(_ project: String) -> [String: Any] {
        let p = self.project(named: project)
        return ["t": "status", "project": project, "status": (p?.status ?? []).map(statusDict),
                "seen": (p?.seen ?? []).map(statusDict)]
    }

    func terminalDict(_ t: Terminal) -> [String: Any] {
        let agent = t.cli == "claude"
        return [
            "id": t.id, "label": t.label, "project": t.project,
            "cols": t.cols, "rows": t.rows, "remote": t.remote,
            "pinned": t.pinned, "emoji": t.emoji, "cli": t.cli,
            "canFork": agent, "canForkCopy": agent && !t.remote,
            "canTitle": agent && t.label != Self.conversationTitle,
        ]
    }

    func terminalsPayload(_ project: String) -> [String: Any] {
        ["t": "terminals", "project": project,
         "terminals": (terminals[project] ?? []).map(terminalDict)]
    }

    func gitFileDict(_ f: GitFile) -> [String: Any] {
        ["path": f.path, "status": f.status, "staged": f.staged, "stamp": f.stamp]
    }

    func gitSnapshotPayload(_ project: String) -> [String: Any] {
        guard let r = git[project] else {
            return ["t": "git", "project": project, "ok": true, "isRepo": false]
        }
        var d: [String: Any] = [
            "t": "git", "project": project, "ok": true,
            "isRepo": r.isRepo, "branch": r.branch, "detached": r.detached,
            "hasUpstream": r.hasUpstream, "ahead": r.ahead, "behind": r.behind,
            "defaultBranch": r.defaultBranch, "ghCli": r.ghCli,
            "files": r.files.map(gitFileDict),
        ]
        if let autoPulled = r.autoPulled { d["autoPulled"] = autoPulled }
        return d
    }

    func jobDict(_ j: Job) -> [String: Any] {
        var schedule: [String: Any] = ["mode": j.scheduleMode]
        switch j.scheduleMode {
        case "interval":
            schedule["everySecs"] = j.everySecs
            if j.everyMaxSecs > j.everySecs { schedule["everyMaxSecs"] = j.everyMaxSecs }
        case "manual": break
        default:
            schedule["atMinutes"] = j.atMinutes
            schedule["days"] = j.days
            if let until = j.untilMinutes { schedule["untilMinutes"] = until }
            if j.times > 1 { schedule["times"] = j.times }
            if j.pickDays > 0 { schedule["pickDays"] = j.pickDays }
        }
        var o: [String: Any] = [
            "id": j.id, "project": j.project, "valid": true, "source": j.source,
            "error": "", "label": j.label, "emoji": j.emoji, "enabled": j.enabled,
            "duplicate": j.duplicate, "runKind": j.runKind, "description": j.summary,
            "schedule": schedule,
            "lastResult": j.lastResult, "running": j.running,
            "agent": j.agent, "model": j.model, "effort": j.effort,
        ]
        if let v = j.lastRunAt { o["lastRunAt"] = v }
        if let v = j.nextFireAt { o["nextFireAt"] = v }
        if let v = j.runningSince { o["runningSince"] = v }
        o["unread"] = jobUnreadCount(j)
        if let ask = openAsk(j) { o["ask"] = ask }
        return o
    }

    /// The question the job is waiting on, as its row carries it: with the
    /// project it waits in and the run that asked.
    func openAsk(_ j: Job) -> [String: Any]? {
        for run in j.history.reversed() {
            if var ask = run.asks.first(where: { $0["status"] as? String == "open" }) {
                ask["project"] = j.project
                ask["at"] = run.at
                return ask
            }
        }
        return nil
    }

    /// Runs that landed since the automation was last read. Mirrors the Mac:
    /// quiet checks and skips leave nothing to read, so they never count.
    func jobUnreadCount(_ j: Job) -> Int {
        j.history.filter { $0.at > j.seenAt && Self.readableResults.contains($0.result) }.count
    }

    static let readableResults: Set<String> = [
        "completed", "found-work", "error", "timed-out", "context-full",
    ]

    func jobsPayload() -> [String: Any] {
        ["t": "jobs", "ok": true, "jobs": jobs.map(jobDict)]
    }

    func jobRunDict(_ r: JobRun, seenAt: Int = 0) -> [String: Any] {
        var o: [String: Any] = ["at": r.at, "result": r.result]
        if r.at > seenAt, Self.readableResults.contains(r.result) { o["unread"] = true }
        if r.count > 1 { o["count"] = r.count }
        if !r.copy.isEmpty { o["copy"] = r.copy }
        if !r.output.isEmpty { o["output"] = r.output }
        if let v = r.durationSecs { o["durationSecs"] = v }
        if let v = r.costUsd { o["costUsd"] = v }
        if !r.session.isEmpty { o["session"] = r.session }
        if !r.resumed.isEmpty { o["resumed"] = r.resumed }
        if let v = r.follows { o["follows"] = v }
        if !r.question.isEmpty { o["question"] = r.question }
        if !r.asks.isEmpty { o["asks"] = r.asks }
        if !r.answerTo.isEmpty { o["answerTo"] = r.answerTo }
        return o
    }
}

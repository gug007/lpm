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
    }

    struct Project {
        var name: String
        var label: String
        var running: Bool
        var isRemote: Bool = false
        var parentName: String = ""
        var services: [Svc] = []
        var profiles: [Profile] = []
        var activeProfile: String = ""
        // Action mappings kept as raw wire dicts — the shape is recursive and
        // largely inert data, so structuring it would only add friction.
        var actions: [[String: Any]] = []
        var status: [Status] = []
    }

    var projects: [Project] = []

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
    // Poll counters ("project\nservice") so service logs grow between polls.
    var serviceLogTicks: [String: Int] = [:]

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
    }

    var terminals: [String: [Terminal]] = [:] // project -> terminals

    struct ComposerDraft {
        var text: String
        var rev: Int
    }

    // Mirrored composer drafts keyed by terminal id. `composerDraftRev` is globally
    // monotonic (like the Mac hub's) so a re-typed draft always outranks a prior one.
    var composerDrafts: [String: ComposerDraft] = [:]
    var composerDraftRev = 0

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
    }

    var git: [String: GitRepo] = [:] // project -> repo

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
        var scheduleMode: String = "calendar" // interval | calendar
        var everySecs: Int = 0
        var atMinutes: Int = 0
        var days: [String] = []
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
    }

    private mutating func seedProjects() {
        func action(_ name: String, _ label: String, _ cmd: String) -> [String: Any] {
            ["name": name, "label": label, "type": "command", "cmd": cmd]
        }
        projects = [
            Project(
                name: "storefront", label: "storefront", running: true,
                services: [
                    Svc(name: "web", cmd: "npm run dev", port: 3000, running: true),
                    Svc(name: "api", cmd: "npm run api", port: 4000, running: true),
                    Svc(name: "worker", cmd: "npm run worker", port: 0, running: false),
                ],
                actions: [action("test", "Test", "npm test"),
                          action("lint", "Lint", "npm run lint")]
            ),
            Project(
                name: "api-gateway", label: "api-gateway", running: false,
                services: [Svc(name: "server", cmd: "go run ./cmd/server", port: 8080, running: false)],
                actions: [["name": "test", "label": "Test", "type": "background",
                           "cmd": "go test ./..."]]
            ),
            Project(
                name: "mobile-app", label: "mobile-app", running: false,
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
                     emoji: "✨", cli: "claude",
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
                enabled: true, runKind: "cmd", scheduleMode: "calendar", atMinutes: 180,
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
                ]),
            Job(id: "weekly-deps", project: "blog", label: "Weekly dependency check", emoji: "📦",
                enabled: false, runKind: "prompt", scheduleMode: "calendar", atMinutes: 360,
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
          test: npm test
          lint: npm run lint
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
        ["key": s.key, "value": s.value, "priority": s.priority, "timestamp": s.timestamp]
    }

    func projectDict(_ p: Project) -> [String: Any] {
        [
            "name": p.name,
            "label": p.label,
            "running": p.running,
            "isRemote": p.isRemote,
            "parentName": p.parentName,
            "statusEntries": p.status.map(statusDict),
            "services": p.services.filter(\.running).map(serviceDict),
            "allServices": p.services.map(serviceDict),
            "profiles": p.profiles.map { ["name": $0.name, "services": $0.services] },
            "activeProfile": p.activeProfile,
            "actions": p.actions,
        ]
    }

    func projectsPayload() -> [String: Any] {
        ["t": "projects", "projects": projects.map(projectDict)]
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
        let entries = self.project(named: project)?.status ?? []
        return ["t": "status", "project": project, "status": entries.map(statusDict)]
    }

    func terminalDict(_ t: Terminal) -> [String: Any] {
        [
            "id": t.id, "label": t.label, "project": t.project,
            "cols": t.cols, "rows": t.rows, "remote": t.remote,
            "pinned": t.pinned, "emoji": t.emoji, "cli": t.cli,
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
        return [
            "t": "git", "project": project, "ok": true,
            "isRepo": r.isRepo, "branch": r.branch, "detached": r.detached,
            "hasUpstream": r.hasUpstream, "ahead": r.ahead, "behind": r.behind,
            "defaultBranch": r.defaultBranch, "ghCli": r.ghCli,
            "files": r.files.map(gitFileDict),
        ]
    }

    func jobDict(_ j: Job) -> [String: Any] {
        var schedule: [String: Any] = ["mode": j.scheduleMode]
        switch j.scheduleMode {
        case "interval": schedule["everySecs"] = j.everySecs
        case "manual": break
        default: schedule["atMinutes"] = j.atMinutes; schedule["days"] = j.days
        }
        var o: [String: Any] = [
            "id": j.id, "project": j.project, "valid": true, "source": j.source,
            "error": "", "label": j.label, "emoji": j.emoji, "enabled": j.enabled,
            "duplicate": j.duplicate, "runKind": j.runKind, "schedule": schedule,
            "lastResult": j.lastResult, "running": j.running,
            "agent": j.agent, "model": j.model, "effort": j.effort,
        ]
        if let v = j.lastRunAt { o["lastRunAt"] = v }
        if let v = j.nextFireAt { o["nextFireAt"] = v }
        if let v = j.runningSince { o["runningSince"] = v }
        return o
    }

    func jobsPayload() -> [String: Any] {
        ["t": "jobs", "ok": true, "jobs": jobs.map(jobDict)]
    }

    func jobRunDict(_ r: JobRun) -> [String: Any] {
        var o: [String: Any] = ["at": r.at, "result": r.result]
        if r.count > 1 { o["count"] = r.count }
        if !r.copy.isEmpty { o["copy"] = r.copy }
        if !r.output.isEmpty { o["output"] = r.output }
        if let v = r.durationSecs { o["durationSecs"] = v }
        if let v = r.costUsd { o["costUsd"] = v }
        if !r.session.isEmpty { o["session"] = r.session }
        if !r.resumed.isEmpty { o["resumed"] = r.resumed }
        if let v = r.follows { o["follows"] = v }
        if !r.question.isEmpty { o["question"] = r.question }
        return o
    }
}

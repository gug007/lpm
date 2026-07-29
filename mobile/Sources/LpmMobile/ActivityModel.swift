import Foundation

/// What an agent is doing, in product words. `idle` is the catch-all for a status
/// nothing acts on. Mirrors the desktop's agentStatus.ts.
enum AgentState: CaseIterable {
    case needsYou, error, working, done, idle

    /// Attention order; lower is more urgent.
    var rank: Int {
        switch self {
        case .needsYou: return 0
        case .error: return 1
        case .working: return 2
        case .done: return 3
        case .idle: return 4
        }
    }

    var label: String {
        switch self {
        case .needsYou: return "Needs you"
        case .error: return "Problem"
        case .working: return "Working"
        case .done: return "Done"
        case .idle: return "Idle"
        }
    }

    /// The four status strings the Mac reports; anything else is idle.
    static func of(_ value: String) -> AgentState {
        switch value {
        case "Waiting": return .needsYou
        case "Error": return .error
        case "Running": return .working
        case "Done": return .done
        default: return .idle
        }
    }
}

/// The whole Mac's agents rolled up, for the ambient badge over the entry point
/// into Activity.
struct AgentAmbient: Equatable {
    var needsYou = 0
    var hasError = false

    var isLit: Bool { needsYou > 0 || hasError }
}

func agentAmbient(_ projects: [Project]) -> AgentAmbient {
    var ambient = AgentAmbient()
    for project in projects {
        for entry in project.statusEntries {
            switch AgentState.of(entry.value) {
            case .needsYou: ambient.needsYou += 1
            case .error: ambient.hasError = true
            default: break
            }
        }
    }
    return ambient
}

/// Status entries carry no provider field; the agents encode it in the key prefix
/// (`claude_code_<sessionId>`, `codex_<paneId>`).
func agentProviderLabel(forStatusKey key: String) -> String {
    if key.hasPrefix("claude_code_") { return "Claude Code" }
    if key.hasPrefix("codex_") { return "Codex" }
    return "Agent"
}

/// `name` is the routing key every request takes, `label` the only thing safe to
/// show. An empty `name` means the row belongs to no single project.
struct ActivityIdentity: Equatable {
    var name: String
    var label: String
    var isCopy = false
    var isWorktree = false
    var isRemote = false

    /// Exactly one surface shows these per layout — the row when the list is flat,
    /// the section header when it is grouped.
    var tags: [String] {
        guard !name.isEmpty else { return [] }
        return [isCopy ? "Copy" : nil,
                isWorktree ? "Worktree" : nil,
                isRemote ? "SSH" : nil].compactMap { $0 }
    }

    init(_ project: Project) {
        name = project.name
        label = project.label
        isCopy = !project.parentName.isEmpty && !project.worktree
        isWorktree = project.worktree
        isRemote = project.isRemote
    }

    /// A row that belongs to no single project: `label` stands for the set instead.
    init(nameless label: String) {
        self.name = ""
        self.label = label
    }
}

let multiProjectLabel = "Multiple projects"
let standaloneProjectLabel = "No project"

enum ActivityRowKind { case agent, automation }

struct ActivityRow: Identifiable, Equatable {
    var id: String
    var kind: ActivityRowKind
    var project: ActivityIdentity
    var title: String
    /// What the terminal tab is called — the agent's session title once it names
    /// one. Nil when the tab has no name of its own beyond the agent.
    var tabTitle: String?
    var state: AgentState
    var statusValue: String?
    var terminalId: String?
    var jobId: String?
    /// The automation's owning project, as the automations list keys it — empty for
    /// a global-layer job, which belongs to no one project.
    var jobProject: String?
    /// Millis: when the row entered the state it is in. Nil when nothing stamped it
    /// — an unstamped row can't claim an elapsed time it doesn't know.
    var stateSince: Int?
    var detail: String?
    var dismissable = false
    /// Why it cannot be dismissed, ready to show; nil when it can.
    var dismissBlocked: String?
}

/// Something the project row can start or stop: a profile shortcut when one
/// matches the running set, or an individual service in a custom running set.
struct ActivityChip: Identifiable, Equatable {
    enum Kind { case profile, service }
    var kind: Kind
    var name: String
    var running: Bool

    var id: String { (kind == .profile ? "profile/" : "service/") + name }
    var noun: String { kind == .profile ? "profile" : "service" }
}

struct ActivityServiceGroup: Identifiable, Equatable {
    var project: ActivityIdentity
    var running: [String]
    var declared: [String]
    /// The port each service declares, when it declares one.
    var ports: [String: Int]
    var chips: [ActivityChip]

    var id: String { project.name }
}

struct ActivityCounts: Equatable {
    var needsYou = 0
    var error = 0
    var working = 0
    var done = 0
}

struct Activity {
    var rows: [ActivityRow] = []
    var services: [ActivityServiceGroup] = []
    /// Over every row, before any filter, so narrowing the list never hides an
    /// approval prompt from the header.
    var counts = ActivityCounts()
    /// Projects with nothing running at all — one footer line, not N dead rows.
    var quietProjectCount = 0
}

enum ActivityKindFilter: String, CaseIterable, Identifiable {
    case all, agents, services, automations

    var id: String { rawValue }
    var label: String {
        switch self {
        case .all: return "All"
        case .agents: return "Agents"
        case .services: return "Services"
        case .automations: return "Automations"
        }
    }
}

/// Needs-you, then problems, then working, then done, then silent; longest in that
/// state first; ties broken on the stable id so nothing swaps between renders.
func activityRowsInAttentionOrder(_ rows: [ActivityRow]) -> [ActivityRow] {
    rows.sorted(by: activityRowPrecedes)
}

func activityRowPrecedes(_ a: ActivityRow, _ b: ActivityRow) -> Bool {
    if a.state.rank != b.state.rank { return a.state.rank < b.state.rank }
    // Longest in that state first; an unstamped row can't out-rank a timed one.
    let sinceA = a.stateSince ?? Int.max
    let sinceB = b.stateSince ?? Int.max
    if sinceA != sinceB { return sinceA < sinceB }
    return a.id < b.id
}

/// "waiting 4m" / "working 2m" — how long the row has held its state. Empty when
/// nothing stamped the row, rather than a made-up "0s" that never grows.
func activityElapsedLabel(_ row: ActivityRow, now: Int) -> String {
    guard let since = row.stateSince else { return "" }
    let span = formatActivityDuration(max(0, (now - since) / 1000))
    switch row.state {
    case .needsYou: return "waiting \(span)"
    case .error: return "error \(span)"
    case .working: return "working \(span)"
    case .done: return "done \(span)"
    case .idle: return "open \(span)"
    }
}

/// "12s", "4m", "4m 30s", "1h 12m" — matches the desktop's formatDuration.
func formatActivityDuration(_ secs: Int) -> String {
    if secs < 60 { return "\(max(0, secs))s" }
    let mins = secs / 60
    if mins < 60 {
        let rest = secs % 60
        return rest > 0 ? "\(mins)m \(rest)s" : "\(mins)m"
    }
    let rest = mins % 60
    return rest > 0 ? "\(mins / 60)h \(rest)m" : "\(mins / 60)h"
}

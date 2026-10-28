import Foundation

/// One agent of a project, as the projects list shows it under the project's row.
/// Mirrors the desktop sidebar's sidebarAgents.ts.
struct ProjectAgentRow: Identifiable, Equatable {
    /// The status key, unique within its project.
    var id: String
    var state: AgentState
    /// What the agent's terminal tab is called. Falls back to the agent's own name
    /// until that project's tabs have loaded, which is where the names come from.
    var title: String
    var provider: String
    var terminalId: String?
    /// Millis: what the row's reading counts from — the turn's start for work
    /// running or finished, the state's own start for a wait. Nil when the turn was
    /// never seen starting, so how long it ran is unknowable.
    var since: Int?
    /// Millis: set once the turn ended, freezing the reading at how long the work
    /// took instead of counting on past it.
    var until: Int?
    /// How many further agents report on this row's tab, folded into it.
    var shared = 0
    /// Every status key the row stands for — its own, the agents folded into it
    /// and a seen agent on its tab — which archiving or marking it acts on.
    var keys: [String] = []
    /// Millis: when the row was last opened, for an agent kept after that as seen
    /// (`seenEntries`) and listed muted until archived. Nil for the others.
    var seenAt: Int?

    var seen: Bool { seenAt != nil }

    func elapsed(now: Int) -> String? {
        since.map { shortDuration(millis: (until ?? now) - $0) }
    }
}

// A paired Mac stamps its statuses with its own clock, which can run ahead of
// ours; an unstamped entry would otherwise start in 1970.
private func stamp(_ value: Int, now: Int) -> Int? {
    value > 0 ? min(value, now) : nil
}

/// Most urgent first, and within a state the one that entered it most recently.
private func precedes(_ a: StatusEntry, _ b: StatusEntry) -> Bool {
    let rankA = AgentState.of(a.value).rank
    let rankB = AgentState.of(b.value).rank
    return rankA == rankB ? a.timestamp > b.timestamp : rankA < rankB
}

/// Every agent a project has going, in the order the list shows them: one row per
/// tab, as the desktop sidebar has it. The most urgent agent on a tab speaks for
/// it and the others are counted on it; an agent reporting against no tab keeps
/// its own row. `tabTitles` is that project's terminal id -> the name that tab is
/// showing.
func projectAgentRows(_ project: Project, now: Int, tabTitles: [String: String]) -> [ProjectAgentRow] {
    foldByTerminal(agentRows(project.statusEntries, now: now, tabTitles: tabTitles))
}

/// What the projects list shows under a project from a Mac that archives agents:
/// `projectAgentRows`, then the seen agents, most recently seen first and one row
/// per tab like the rest. A seen agent on a tab that also reports a status adds no
/// row, only its key to that tab's. A finished agent whose key is in `hiding` is
/// being archived and left out.
func projectAgentList(_ project: Project, now: Int, tabTitles: [String: String],
                      hiding: Set<String> = []) -> [ProjectAgentRow] {
    let listed = { (entry: StatusEntry) in
        !(hiding.contains(entry.key) && AgentState.of(entry.value).isFinished)
    }
    var rows = foldByTerminal(agentRows(project.statusEntries.filter(listed), now: now, tabTitles: tabTitles))
    var unlisted: [StatusEntry] = []
    for entry in project.seenEntries where listed(entry) {
        if let index = rows.firstIndex(where: { $0.terminalId == entry.paneID }) {
            rows[index].keys.append(entry.key)
        } else {
            unlisted.append(entry)
        }
    }
    let seen = foldByTerminal(agentRows(unlisted, now: now, tabTitles: tabTitles)).sorted { a, b in
        a.seenAt == b.seenAt ? a.id < b.id : (a.seenAt ?? 0) > (b.seenAt ?? 0)
    }
    return rows + seen
}

/// The rows a project lists once its seen rows past `shown` fold into one line,
/// and how many that line stands for — 0 when there are no more than `shown`.
/// Expanded, every row lists and the line offers to fold them again. Seen rows
/// trail the others, so only seen rows ever fold.
func foldSeenAgents(_ rows: [ProjectAgentRow], shown: Int,
                    expanded: Bool) -> (rows: [ProjectAgentRow], folded: Int) {
    let extra = rows.filter(\.seen).count - max(shown, 0)
    guard extra > 0 else { return (rows, 0) }
    return (expanded ? rows : Array(rows.dropLast(extra)), extra)
}

/// One row per tab: the first agent on a tab speaks for it and the others are
/// counted on it. An agent reporting against no tab keeps its own row.
private func foldByTerminal(_ agents: [ProjectAgentRow]) -> [ProjectAgentRow] {
    var rows: [ProjectAgentRow] = []
    var rowForTerminal: [String: Int] = [:]
    for row in agents {
        guard let terminal = row.terminalId else {
            rows.append(row)
            continue
        }
        if let index = rowForTerminal[terminal] {
            rows[index].shared += 1
            rows[index].keys += row.keys
            rows[index].seenAt = [rows[index].seenAt, row.seenAt].compactMap { $0 }.max()
        } else {
            rowForTerminal[terminal] = rows.count
            rows.append(row)
        }
    }
    return rows
}

private func agentRows(_ entries: [StatusEntry], now: Int, tabTitles: [String: String]) -> [ProjectAgentRow] {
    entries.sorted(by: precedes).map { entry in
        let provider = agentProviderLabel(forStatusKey: entry.key)
        let state = AgentState.of(entry.value)
        let stateSince = stamp(entry.timestamp, now: now) ?? now
        let turnStart = stamp(entry.turnStart, now: now)
        let tab = tabTitles[entry.paneID]
        // A finished turn reads as how long the work took, held still. Waiting and
        // a problem read as how long they have been true — that is the wait you
        // care about. Working spans a turn's approval pauses, so it counts from
        // when the agent picked the work up. Idle is nothing an agent reported, so
        // there is no turn to time.
        var since: Int?
        var until: Int?
        switch state {
        case .done:
            since = turnStart
            until = stamp(entry.endedAt, now: now) ?? stateSince
        case .working:
            since = turnStart ?? stateSince
        case .needsYou, .error:
            since = stateSince
        case .idle:
            break
        }
        return ProjectAgentRow(
            id: entry.key,
            state: state,
            title: (tab?.isEmpty == false) ? tab! : provider,
            provider: provider,
            terminalId: entry.paneID.isEmpty ? nil : entry.paneID,
            since: since,
            until: until,
            keys: [entry.key],
            seenAt: entry.seenAt > 0 ? entry.seenAt : nil
        )
    }
}

extension AgentState {
    /// A turn that ended, well or not: what can be marked seen and archived.
    var isFinished: Bool { self == .done || self == .error }
}

/// The agent each terminal reads as; `projectAgentRows` already holds one per tab.
func agentRowsByTerminal(_ rows: [ProjectAgentRow]) -> [String: ProjectAgentRow] {
    Dictionary(rows.compactMap { row in row.terminalId.map { ($0, row) } },
               uniquingKeysWith: { first, _ in first })
}

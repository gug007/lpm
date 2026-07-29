import Foundation

/// Folds the projects list, its status entries, and the automations list into the
/// Activity screen's rows and service groups. A port of the desktop's fleetRows.ts
/// so both surfaces order and word the same things the same way.

// A paired Mac stamps its statuses with its own clock, which can run ahead of
// ours; an unstamped entry would otherwise start in 1970.
private func stateSince(_ stamped: Int, now: Int) -> Int? {
    stamped <= 0 ? nil : min(stamped, now)
}

private func agentRow(_ project: ActivityIdentity, _ entry: StatusEntry, now: Int,
                      tabTitles: [String: String]) -> ActivityRow {
    let title = agentProviderLabel(forStatusKey: entry.key)
    let tab = tabTitles[entry.paneID]
    return ActivityRow(
        id: "agent:\(project.name):\(entry.key)",
        kind: .agent,
        project: project,
        title: title,
        // An untitled tab is named after its agent, which the row already says.
        tabTitle: (tab != nil && tab != title) ? tab : nil,
        state: AgentState.of(entry.value),
        statusValue: entry.value,
        terminalId: entry.paneID.isEmpty ? nil : entry.paneID,
        jobId: nil,
        jobProject: nil,
        stateSince: stateSince(entry.timestamp, now: now),
        detail: nil
    )
}

/// A job spanning several projects headlines none: naming one of its targets would
/// headline a project that may not be the one running it.
private func automationIdentity(_ targets: [String], count: Int,
                                _ identities: [String: ActivityIdentity]) -> ActivityIdentity {
    if count > 1 { return ActivityIdentity(nameless: multiProjectLabel) }
    guard let name = targets.first, !name.isEmpty else {
        return ActivityIdentity(nameless: standaloneProjectLabel)
    }
    if let known = identities[name] { return known }
    var unknown = ActivityIdentity(nameless: name)
    unknown.name = name
    return unknown
}

private func automationRow(_ job: AutomationJob, targets: [String],
                           _ identities: [String: ActivityIdentity], now: Int) -> ActivityRow {
    let count = max(job.targetCount, targets.count)
    let project = automationIdentity(targets, count: count, identities)
    let since = job.runningSince.map { $0 * 1000 } ?? 0
    return ActivityRow(
        id: "automation:\(project.name):\(job.id)",
        kind: .automation,
        project: project,
        title: job.displayName,
        tabTitle: nil,
        state: .working,
        statusValue: nil,
        terminalId: nil,
        jobId: job.id,
        jobProject: job.project,
        stateSince: stateSince(since, now: now),
        detail: count > 1 ? "Running in \(max(job.runningCount, 1)) of \(count) projects" : nil
    )
}

// Clearing a status wipes every entry on that terminal holding that value, so rows
// sharing (project, terminal, value) would vanish together.
private func dismissKey(_ row: ActivityRow) -> String? {
    guard row.kind == .agent, let terminal = row.terminalId, let value = row.statusValue else {
        return nil
    }
    return "\(row.project.name) \(terminal) \(value)"
}

private func dismissBlockedReason(_ row: ActivityRow, isShared: Bool) -> String? {
    if row.kind == .automation {
        return "This automation clears itself when the run finishes."
    }
    switch row.state {
    case .needsYou:
        return "The agent is asking for you — answering it is what clears this."
    case .working:
        return "The agent is still working — this clears when it finishes."
    case .idle:
        return "There is nothing to clear on this one."
    case .done, .error:
        break
    }
    guard row.terminalId != nil, row.statusValue != nil else {
        return "This isn't tied to an open terminal, so there is nothing to clear."
    }
    return isShared
        ? "Another agent shares this terminal — clear it from the terminal so only one goes."
        : nil
}

private func markDismissable(_ rows: inout [ActivityRow]) {
    var shared: [String: Int] = [:]
    for row in rows {
        if let key = dismissKey(row) { shared[key, default: 0] += 1 }
    }
    for i in rows.indices {
        let key = dismissKey(rows[i])
        let blocked = dismissBlockedReason(rows[i], isShared: key != nil && shared[key!] != 1)
        rows[i].dismissable = blocked == nil
        rows[i].dismissBlocked = blocked
    }
}

/// Collapse services into profile shortcuts only while a profile matches the
/// running set exactly. A custom mix needs individual service chips so every
/// running process remains visible and independently controllable.
private func chips(of project: Project, started: Set<String>) -> [ActivityChip] {
    let profiles = project.profiles
    let activeProfile = profiles.first { $0.name == project.activeProfile }
    if activeProfile == nil && !started.isEmpty {
        return project.allServices.map {
            ActivityChip(kind: .service, name: $0.name, running: started.contains($0.name))
        }
    }

    let covered = Set(profiles.flatMap(\.services))
    var out = profiles.map {
        ActivityChip(kind: .profile, name: $0.name, running: project.activeProfile == $0.name)
    }
    for service in project.allServices where !covered.contains(service.name) {
        out.append(ActivityChip(kind: .service, name: service.name,
                                running: started.contains(service.name)))
    }
    return out
}

private func serviceGroup(_ project: Project, _ identity: ActivityIdentity) -> ActivityServiceGroup? {
    guard project.running else { return nil }
    let running = project.services.map(\.name)
    let started = Set(running)
    let declared = project.allServices.map(\.name).filter { !started.contains($0) }
    if running.isEmpty && declared.isEmpty { return nil }
    var ports: [String: Int] = [:]
    for service in project.allServices where service.port > 0 { ports[service.name] = service.port }
    return ActivityServiceGroup(project: identity, running: running, declared: declared,
                                ports: ports, chips: chips(of: project, started: started))
}

/// `terminalTitles` is project -> terminal id -> that tab's name; only projects
/// whose terminals the phone has fetched contribute one. `now` is unix millis.
func buildActivity(projects: [Project], jobs: [AutomationJob], now: Int,
                   terminalTitles: [String: [String: String]]) -> Activity {
    var identities: [String: ActivityIdentity] = [:]
    for project in projects { identities[project.name] = ActivityIdentity(project) }

    var rows: [ActivityRow] = []
    var services: [ActivityServiceGroup] = []
    var busy = Set<String>()
    for project in projects {
        guard let identity = identities[project.name] else { continue }
        let tabTitles = terminalTitles[project.name] ?? [:]
        for entry in project.statusEntries {
            rows.append(agentRow(identity, entry, now: now, tabTitles: tabTitles))
            busy.insert(project.name)
        }
        if let group = serviceGroup(project, identity) {
            services.append(group)
            busy.insert(project.name)
        }
    }

    for job in jobs where job.running {
        let targets = job.runsIn
        rows.append(automationRow(job, targets: targets, identities, now: now))
        // Every project the job runs in is busy, even the ones the row can't name.
        for name in targets { busy.insert(name) }
    }

    markDismissable(&rows)

    var counts = ActivityCounts()
    for row in rows {
        switch row.state {
        case .needsYou: counts.needsYou += 1
        case .error: counts.error += 1
        case .working: counts.working += 1
        case .done: counts.done += 1
        case .idle: break
        }
    }

    // Services keep the projects list's own order — the one the sidebar shows —
    // rather than an attention order they have no signal to sort by.
    return Activity(
        rows: activityRowsInAttentionOrder(rows),
        services: services,
        counts: counts,
        quietProjectCount: projects.filter { !busy.contains($0.name) }.count
    )
}

// MARK: - Filtering

private func matches(_ row: ActivityRow, _ query: String) -> Bool {
    row.project.label.localizedCaseInsensitiveContains(query)
        || row.title.localizedCaseInsensitiveContains(query)
        || (row.tabTitle ?? "").localizedCaseInsensitiveContains(query)
}

/// A group whose project matches keeps everything it offers; otherwise only the
/// matching profiles and services stay, and a group left with none drops out.
private func filtered(_ group: ActivityServiceGroup, _ query: String) -> ActivityServiceGroup? {
    if group.project.label.localizedCaseInsensitiveContains(query) { return group }
    let hit = { (name: String) in name.localizedCaseInsensitiveContains(query) }
    var narrowed = group
    narrowed.running = group.running.filter(hit)
    narrowed.declared = group.declared.filter(hit)
    narrowed.chips = group.chips.filter { hit($0.name) }
    if narrowed.running.isEmpty && narrowed.declared.isEmpty && narrowed.chips.isEmpty {
        return nil
    }
    return narrowed
}

func filterActivity(_ activity: Activity, query: String,
                    kind: ActivityKindFilter) -> (rows: [ActivityRow], services: [ActivityServiceGroup]) {
    let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)

    var rows: [ActivityRow]
    switch kind {
    case .all: rows = activity.rows
    case .services: rows = []
    case .agents: rows = activity.rows.filter { $0.kind == .agent }
    case .automations: rows = activity.rows.filter { $0.kind == .automation }
    }
    var services = (kind == .all || kind == .services) ? activity.services : []

    if !needle.isEmpty {
        rows = rows.filter { matches($0, needle) }
        services = services.compactMap { filtered($0, needle) }
    }
    return (rows, services)
}

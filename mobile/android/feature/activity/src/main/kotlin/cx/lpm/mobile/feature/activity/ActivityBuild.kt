package cx.lpm.mobile.feature.activity

import cx.lpm.mobile.core.model.AgentState
import cx.lpm.mobile.core.model.AutomationJob
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.model.StatusEntry
import cx.lpm.mobile.core.model.agentProviderLabel
import cx.lpm.mobile.core.model.crashed

// Folds the projects list, its status entries, and the automations list into the
// Activity screen's rows and service groups. A port of iOS `ActivityBuild.swift` so
// both phones order and word the same things the same way.

// A paired Mac stamps its statuses with its own clock, which can run ahead of ours;
// an unstamped entry would otherwise start in 1970.
private fun stateSince(stamped: Long, now: Long): Long? =
    if (stamped <= 0) null else minOf(stamped, now)

private fun agentRow(
    project: ActivityIdentity,
    entry: StatusEntry,
    now: Long,
    tabTitles: Map<String, String>
): ActivityRow {
    val title = agentProviderLabel(entry.key)
    val tab = tabTitles[entry.paneID]
    val place = project.machine?.let { "$it/${project.name}" } ?: project.name
    return ActivityRow(
        id = "agent:$place:${entry.key}",
        kind = ActivityRowKind.Agent,
        project = project,
        title = title,
        // An untitled tab is named after its agent, which the row already says.
        tabTitle = tab?.takeIf { it != title },
        state = AgentState.of(entry.value),
        statusValue = entry.value,
        terminalId = entry.paneID.ifEmpty { null },
        stateSince = stateSince(entry.timestamp, now)
    )
}

// A job spanning several projects headlines none: naming one of its targets would
// headline a project that may not be the one running it.
private fun automationIdentity(
    targets: List<String>,
    count: Int,
    identities: Map<String, ActivityIdentity>
): ActivityIdentity {
    if (count > 1) return ActivityIdentity.nameless(MULTI_PROJECT_LABEL)
    val name = targets.firstOrNull()
    if (name.isNullOrEmpty()) return ActivityIdentity.nameless(STANDALONE_PROJECT_LABEL)
    return identities[name] ?: ActivityIdentity.nameless(name).copy(name = name)
}

private fun automationRow(
    job: AutomationJob,
    targets: List<String>,
    identities: Map<String, ActivityIdentity>,
    now: Long
): ActivityRow {
    val count = maxOf(job.targetCount, targets.size)
    val project = automationIdentity(targets, count, identities)
    val since = job.runningSince?.let { it * 1000 } ?: 0
    return ActivityRow(
        id = "automation:${project.name}:${job.id}",
        kind = ActivityRowKind.Automation,
        project = project,
        title = job.displayName,
        state = AgentState.Working,
        jobId = job.id,
        jobProject = job.project,
        stateSince = stateSince(since, now),
        detail = if (count >
            1
        ) {
            "Running in ${maxOf(job.runningCount, 1)} of $count projects"
        } else {
            null
        }
    )
}

// Clearing a status wipes every entry on that terminal holding that value, so rows
// sharing (project, terminal, value) would vanish together.
private fun dismissKey(row: ActivityRow): String? {
    if (row.kind != ActivityRowKind.Agent) return null
    val terminal = row.terminalId ?: return null
    val value = row.statusValue ?: return null
    return "${row.project.name} $terminal $value"
}

private fun dismissBlockedReason(row: ActivityRow, isShared: Boolean): String? {
    if (row.kind == ActivityRowKind.Automation) {
        return "This automation clears itself when the run finishes."
    }
    row.project.machineName?.let { machine ->
        return "This agent runs on $machine — open it there to clear this."
    }
    when (row.state) {
        AgentState.NeedsYou ->
            return "The agent is asking for you — answering it is what clears this."

        AgentState.Working ->
            return "The agent is still working — this clears when it finishes."

        AgentState.Idle -> return "There is nothing to clear on this one."

        AgentState.Done, AgentState.Error -> Unit
    }
    if (row.terminalId == null || row.statusValue == null) {
        return "This isn't tied to an open terminal, so there is nothing to clear."
    }
    return if (isShared) {
        "Another agent shares this terminal — clear it from the terminal so only one goes."
    } else {
        null
    }
}

private fun markDismissable(rows: List<ActivityRow>): List<ActivityRow> {
    val shared = rows.mapNotNull(::dismissKey).groupingBy { it }.eachCount()
    return rows.map { row ->
        val key = dismissKey(row)
        val blocked = dismissBlockedReason(row, isShared = key != null && shared[key] != 1)
        row.copy(dismissable = blocked == null, dismissBlocked = blocked)
    }
}

/**
 * Collapse services into profile shortcuts only while a profile matches the running
 * set exactly. A custom mix needs individual service chips so every running process
 * remains visible and independently controllable.
 */
private fun chips(
    project: Project,
    started: Set<String>,
    crashed: Set<String>
): List<ActivityChip> {
    val profiles = project.profiles
    val activeProfile = profiles.firstOrNull { it.name == project.activeProfile }
    // A lit profile would hide which of its services crashed.
    if ((activeProfile == null || crashed.isNotEmpty()) && (started + crashed).isNotEmpty()) {
        return project.allServices.map {
            ActivityChip(
                ActivityChip.Kind.Service,
                it.name,
                running = it.name in started,
                crashed = it.name in crashed
            )
        }
    }
    val covered = profiles.flatMap { it.services }.toSet()
    return profiles.map {
        ActivityChip(ActivityChip.Kind.Profile, it.name, running = project.activeProfile == it.name)
    } + project.allServices.filterNot { it.name in covered }.map {
        ActivityChip(ActivityChip.Kind.Service, it.name, running = it.name in started)
    }
}

private fun serviceGroup(project: Project, identity: ActivityIdentity): ActivityServiceGroup? {
    if (!project.running) return null
    val running = project.services.filterNot { it.exited }.map { it.name }
    val started = running.toSet()
    val crashed = project.services.filter { it.crashed }.map { it.name }.toSet()
    val declared = project.allServices.map { it.name }.filterNot { it in started }
    if (running.isEmpty() && declared.isEmpty()) return null
    val ports = project.allServices.filter { it.port > 0 }.associate { it.name to it.port }
    return ActivityServiceGroup(
        identity,
        running,
        declared,
        ports,
        chips(project, started, crashed)
    )
}

/**
 * Everything Activity lists: the Mac's own projects in full, and the agents on the
 * machines it connects to — which the Mac's own Activity counts too.
 * `terminalTitles` is project → terminal id → that tab's name; only projects whose
 * terminals the phone has fetched contribute one. `now` is unix millis.
 */
fun buildActivity(
    projects: List<Project>,
    machines: List<ActivityMachine> = emptyList(),
    jobs: List<AutomationJob>,
    now: Long,
    terminalTitles: Map<String, Map<String, String>>
): Activity {
    val identities = projects.associate { it.name to ActivityIdentity.of(it) }
    val rows = mutableListOf<ActivityRow>()
    val services = mutableListOf<ActivityServiceGroup>()
    val busy = mutableSetOf<String>()
    for (project in projects) {
        val identity = identities[project.name] ?: continue
        val tabTitles = terminalTitles[project.name].orEmpty()
        for (entry in project.statusEntries) {
            rows += agentRow(identity, entry, now, tabTitles)
            busy += project.name
        }
        serviceGroup(project, identity)?.let {
            services += it
            busy += project.name
        }
    }

    for (machine in machines) {
        for (project in machine.projects) {
            val identity = ActivityIdentity.of(project, machine)
            project.statusEntries.forEach { rows += agentRow(identity, it, now, emptyMap()) }
        }
    }

    for (job in jobs.filter { it.running }) {
        val targets = job.runsIn
        rows += automationRow(job, targets, identities, now)
        // Every project the job runs in is busy, even the ones the row can't name.
        busy += targets
    }

    // Services keep the projects list's own order — the one the sidebar shows —
    // rather than an attention order they have no signal to sort by.
    return Activity(
        rows = markDismissable(rows).sortedWith(ActivityAttentionOrder),
        services = services,
        quietProjectCount = projects.count { it.name !in busy }
    )
}

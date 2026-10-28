package cx.lpm.mobile.core.demo

// Wire-frame builders: turn the structured world into the payloads the phone decodes.
// Shared by every domain handler so the mapping lives in one place.

internal fun serviceDict(s: DemoWorld.Svc): Dict =
    mapOf("name" to s.name, "cmd" to s.cmd, "port" to s.port)

internal fun statusDict(s: DemoWorld.Status): Dict {
    val d = mutableMapOf<String, Any?>(
        "key" to s.key,
        "value" to s.value,
        "priority" to s.priority,
        "timestamp" to s.timestamp,
        "paneID" to s.paneID
    )
    if (s.turnStart > 0) d["turnStart"] = s.turnStart
    if (s.endedAt > 0) d["endedAt"] = s.endedAt
    if (s.seenAt > 0) d["seenAt"] = s.seenAt
    return d
}

internal fun projectDict(p: DemoWorld.Project): Dict {
    val d = mutableMapOf<String, Any?>(
        "name" to p.name,
        "label" to p.label,
        "running" to p.running,
        "isRemote" to p.isRemote,
        "parentName" to p.parentName,
        "worktree" to p.worktree,
        "statusEntries" to p.status.map(::statusDict),
        "seenEntries" to p.seen.map(::statusDict),
        "services" to p.services.filter { it.running }.map(::serviceDict),
        "allServices" to p.services.map(::serviceDict),
        "profiles" to p.profiles.map { mapOf("name" to it.name, "services" to it.services) },
        "activeProfile" to p.activeProfile,
        "actions" to p.actions,
        "zones" to p.zones
    )
    p.workStatus?.let { d["workStatus"] = it }
    p.autoPull?.let { d["autoPull"] = it }
    p.claudeAccount?.let { d["claudeAccount"] = it }
    p.claudeAccounts?.let { d["claudeAccounts"] = it }
    return d
}

internal fun DemoWorld.projectsPayload(): Dict {
    // The palette a Mac starts with, plus one the demo user added.
    val palette = defaultWorkStatusPalette + CustomWorkStatus(label = "QA", emoji = "🧪")
    return mapOf(
        "t" to "projects",
        "projects" to projects.map(::projectDict),
        "workStatuses" to palette.map {
            mapOf("label" to it.label, "emoji" to it.emoji, "withNote" to it.withNote)
        },
        "workStatusOrder" to emptyList<String>(),
        "autoPullMode" to "all",
        "seenAgentsShown" to 3,
        "keepFinishedAgents" to true
    )
}

internal fun DemoWorld.sidebarPayload(): Dict = mapOf(
    "t" to "sidebar",
    "order" to sidebarOrder.toList(),
    "groups" to folders.map {
        mapOf(
            "id" to it.id,
            "name" to it.name,
            "collapsed" to it.collapsed,
            "members" to it.members
        )
    }
)

internal fun DemoWorld.statusPayload(project: String): Dict {
    val p = project(project)
    return mapOf(
        "t" to "status",
        "project" to project,
        "status" to p?.status.orEmpty().map(::statusDict),
        "seen" to p?.seen.orEmpty().map(::statusDict)
    )
}

internal fun terminalDict(t: DemoWorld.Terminal): Dict {
    val agent = t.cli == "claude"
    return mapOf(
        "id" to t.id,
        "label" to t.label,
        "project" to t.project,
        "cols" to t.cols,
        "rows" to t.rows,
        "remote" to t.remote,
        "pinned" to t.pinned,
        "emoji" to t.emoji,
        "cli" to t.cli,
        "canFork" to agent,
        "canForkCopy" to (agent && !t.remote),
        "canTitle" to (agent && t.label != DemoWorld.CONVERSATION_TITLE)
    )
}

internal fun DemoWorld.terminalsPayload(project: String): Dict = mapOf(
    "t" to "terminals",
    "project" to project,
    "terminals" to (terminals[project] ?: emptyList()).map(::terminalDict)
)

internal fun gitFileDict(f: DemoWorld.GitFile): Dict =
    mapOf("path" to f.path, "status" to f.status, "staged" to f.staged, "stamp" to f.stamp)

internal fun DemoWorld.gitSnapshotPayload(project: String): Dict {
    val r = git[project] ?: return mapOf(
        "t" to "git",
        "project" to project,
        "ok" to true,
        "isRepo" to false
    )
    val d = mutableMapOf<String, Any?>(
        "t" to "git",
        "project" to project,
        "ok" to true,
        "isRepo" to r.isRepo,
        "branch" to r.branch,
        "detached" to r.detached,
        "hasUpstream" to r.hasUpstream,
        "ahead" to r.ahead,
        "behind" to r.behind,
        "defaultBranch" to r.defaultBranch,
        "ghCli" to r.ghCli,
        "files" to r.files.map(::gitFileDict)
    )
    r.autoPulled?.let { d["autoPulled"] = it }
    return d
}

internal fun jobDict(j: DemoWorld.Job): Dict {
    val schedule = mutableMapOf<String, Any?>("mode" to j.scheduleMode)
    when (j.scheduleMode) {
        "interval" -> {
            schedule["everySecs"] = j.everySecs
            if (j.everyMaxSecs > j.everySecs) schedule["everyMaxSecs"] = j.everyMaxSecs
        }

        "manual" -> Unit

        else -> {
            schedule["atMinutes"] = j.atMinutes
            schedule["days"] = j.days
            j.untilMinutes?.let { schedule["untilMinutes"] = it }
            if (j.times > 1) schedule["times"] = j.times
            if (j.pickDays > 0) schedule["pickDays"] = j.pickDays
        }
    }
    val o = mutableMapOf<String, Any?>(
        "id" to j.id,
        "project" to j.project,
        "valid" to true,
        "source" to j.source,
        "error" to "",
        "label" to j.label,
        "emoji" to j.emoji,
        "enabled" to j.enabled,
        "duplicate" to j.duplicate,
        "runKind" to j.runKind,
        "description" to j.summary,
        "schedule" to schedule,
        "lastResult" to j.lastResult,
        "running" to j.running,
        "agent" to j.agent,
        "model" to j.model,
        "effort" to j.effort
    )
    j.lastRunAt?.let { o["lastRunAt"] = it }
    j.nextFireAt?.let { o["nextFireAt"] = it }
    j.runningSince?.let { o["runningSince"] = it }
    o["unread"] = jobUnreadCount(j)
    openAsk(j)?.let { o["ask"] = it }
    return o
}

/** The question the job is waiting on, as its row carries it: with the project it waits in and the run that asked. */
internal fun openAsk(j: DemoWorld.Job): Dict? {
    for (run in j.history.asReversed()) {
        val ask = run.asks.firstOrNull { it.string("status") == "open" } ?: continue
        return ask + mapOf("project" to j.project, "at" to run.at)
    }
    return null
}

/**
 * Runs that landed since the automation was last read. Mirrors the Mac: quiet checks
 * and skips leave nothing to read, so they never count.
 */
internal fun jobUnreadCount(j: DemoWorld.Job): Int =
    j.history.count { it.at > j.seenAt && it.result in readableResults }

internal val readableResults =
    setOf("completed", "found-work", "error", "timed-out", "context-full")

internal fun DemoWorld.jobsPayload(): Dict =
    mapOf("t" to "jobs", "ok" to true, "jobs" to jobs.map(::jobDict))

internal fun jobRunDict(r: DemoWorld.JobRun, seenAt: Long = 0): Dict {
    val o = mutableMapOf<String, Any?>("at" to r.at, "result" to r.result)
    if (r.at > seenAt && r.result in readableResults) o["unread"] = true
    if (r.count > 1) o["count"] = r.count
    if (r.copy.isNotEmpty()) o["copy"] = r.copy
    if (r.output.isNotEmpty()) o["output"] = r.output
    r.durationSecs?.let { o["durationSecs"] = it }
    r.costUsd?.let { o["costUsd"] = it }
    if (r.session.isNotEmpty()) o["session"] = r.session
    if (r.resumed.isNotEmpty()) o["resumed"] = r.resumed
    r.follows?.let { o["follows"] = it }
    if (r.question.isNotEmpty()) o["question"] = r.question
    if (r.asks.isNotEmpty()) o["asks"] = r.asks
    if (r.answerTo.isNotEmpty()) o["answerTo"] = r.answerTo
    return o
}

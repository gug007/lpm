package cx.lpm.mobile.feature.automations.editor

import cx.lpm.mobile.core.model.asInt
import cx.lpm.mobile.core.model.asLong
import cx.lpm.mobile.core.model.asNumber
import cx.lpm.mobile.core.model.asString
import cx.lpm.mobile.core.model.bool
import cx.lpm.mobile.core.model.int
import cx.lpm.mobile.core.model.obj
import cx.lpm.mobile.core.model.string
import cx.lpm.mobile.core.model.trimmingWhitespace
import cx.lpm.mobile.feature.automations.format.AutomationMachines
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

/** The form for a job's stored YAML body (`jobConfig`), as the desktop reads it. */
fun JobEditorDraft.Companion.from(body: JsonObject): JobEditorDraft {
    var d = JobEditorDraft(
        label = body.string("label") ?: "",
        emoji = body.string("emoji") ?: "",
        check = body.string("check") ?: "",
        verify = body.string("verify") ?: "",
        sendTo = body["sendTo"],
        machines = AutomationMachines.read(body["machines"])
    )
    val options = body.obj("duplicate")
    if (body.bool("duplicate") == true) {
        d = d.copy(duplicateMode = DuplicateMode.Copy)
    } else if (options != null) {
        d = d.copy(
            duplicateMode = if (options.string("mode") == "worktree") {
                DuplicateMode.Worktree
            } else {
                DuplicateMode.Copy
            },
            duplicatePullLatest = options.bool("pullLatest"),
            duplicateReinstallDeps = options.bool("reinstallDeps"),
            duplicateExcludeUncommitted = options.bool("excludeUncommitted")
        )
    }
    body.obj("schedule")?.let { d = d.withSchedule(it) }
    body.obj("run")?.let { d = d.withRun(it) }
    val projects = body["projects"] as? JsonArray
    if (projects != null) {
        d = d.copy(targets = projects.map(::describing), hasProjectsKey = true)
    }
    return d
}

private fun JobEditorDraft.withSchedule(schedule: JsonObject): JobEditorDraft {
    if (scheduleNeedsMac(schedule)) return copy(keptSchedule = schedule)
    if (schedule.bool("manual") == true) return copy(scheduleMode = ScheduleMode.Manual)
    val every = schedule["every"]
    if (every != null) {
        val (value, unit, max) = parseEvery(every)
        val longest = max?.takeIf { it > value }
        return copy(
            scheduleMode = ScheduleMode.Interval,
            intervalValue = value,
            intervalUnit = unit,
            varyInterval = longest != null,
            intervalMaxValue = longest ?: intervalMaxValue
        )
    }
    var d = copy(scheduleMode = ScheduleMode.Time)
    schedule.string("at")?.trimmingWhitespace()?.takeIf { it.isNotEmpty() }?.let {
        d = d.copy(time = it)
    }
    (schedule["days"] as? JsonArray)?.let { days ->
        val set = days.map { describing(it).lowercase() }.toSet()
        d = d.copy(days = WEEKDAYS.filter { it in set })
    }
    schedule.string("until")?.trimmingWhitespace()?.takeIf { it.isNotEmpty() }?.let { until ->
        val times = schedule.int("times")?.takeIf { it > 1 } ?: d.timesPerDay
        d = d.copy(randomWindow = true, untilTime = until, timesPerDay = times)
    }
    schedule.int("pickDays")?.takeIf { it >= 1 }?.let {
        d = d.copy(randomDays = true, pickDays = it)
    }
    return d
}

private fun JobEditorDraft.withRun(run: JsonObject): JobEditorDraft {
    val action = run.string("action")?.trimmingWhitespace().orEmpty()
    if (action.isNotEmpty()) {
        return copy(
            runMode = RunMode.Action,
            action = action,
            actionPrompt = run.string("prompt")?.trimmingWhitespace().orEmpty()
        )
    }
    val cmd = run.string("cmd")?.trimmingWhitespace().orEmpty()
    if (cmd.isNotEmpty()) return copy(runMode = RunMode.Cmd, cmd = cmd)
    val prompt = run.string("prompt") ?: return this
    return copy(
        runMode = RunMode.Prompt,
        prompt = prompt,
        agent = run.string("agent").orEmpty().lowercase(),
        model = run.string("model").orEmpty(),
        effort = run.string("effort").orEmpty().lowercase(),
        readOnly = run.string("access")?.lowercase() == "read",
        quiet = run.bool("quiet") ?: false,
        memory = run.bool("memory") ?: false,
        claudeAccount = run.string("claudeAccount")
    )
}

/**
 * The full YAML body for `saveJob`, in the shape the desktop's buildJobPayload writes.
 * The Mac replaces the job's whole mapping, so every key read is written back.
 * [writesProjects]: a global job whose scope is editable keeps its `projects` list; an
 * every-project global job keeps that meaning by leaving it out.
 */
fun JobEditorDraft.buildJob(writesProjects: Boolean): JsonObject = buildJsonObject {
    put("label", label.trimmingWhitespace())
    emoji.trimmingWhitespace().takeIf { it.isNotEmpty() }?.let { put("emoji", it) }
    put("schedule", buildSchedule())
    check.trimmingWhitespace().takeIf { it.isNotEmpty() }?.let { put("check", it) }
    verify.trimmingWhitespace().takeIf { it.isNotEmpty() && runMode != RunMode.Action }?.let {
        put("verify", it)
    }
    buildDuplicate()?.let { put("duplicate", it) }
    put("run", buildRun())
    sendTo?.let { put("sendTo", it) }
    if (machines.isNotEmpty()) {
        putJsonArray("machines") {
            machines.forEach { add(JsonPrimitive(it)) }
        }
    }
    if (writesProjects) putJsonArray("projects") { targets.forEach { add(JsonPrimitive(it)) } }
}

private fun JobEditorDraft.buildSchedule(): JsonObject {
    keptSchedule?.let { return it }
    return buildJsonObject {
        when (scheduleMode) {
            ScheduleMode.Manual -> put("manual", true)

            ScheduleMode.Interval -> put(
                "every",
                if (varyInterval && intervalMaxValue > intervalValue) {
                    "$intervalValue-$intervalMaxValue${intervalUnit.suffix}"
                } else {
                    "$intervalValue${intervalUnit.suffix}"
                }
            )

            ScheduleMode.Time -> putTimeSchedule(this@buildSchedule)
        }
    }
}

private fun JsonObjectBuilder.putTimeSchedule(d: JobEditorDraft) {
    put("at", d.time)
    if (d.randomWindow) {
        put("until", d.untilTime)
        if (d.timesPerDay > 1) put("times", d.timesPerDay)
    }
    val ordered = WEEKDAYS.filter { it in d.days }
    if (ordered.isNotEmpty() && ordered.size < WEEKDAYS.size) {
        putJsonArray("days") { ordered.forEach { add(JsonPrimitive(it)) } }
    }
    // Picking every day it has is what using all of them already means, so nothing
    // random is written for it; a pick wider than the days left clamps the same way.
    if (d.randomDays && d.pickDays >= 1 && d.pickDays < d.dayPool) put("pickDays", d.pickDays)
}

private fun JobEditorDraft.buildRun(): JsonObject = buildJsonObject {
    when (runMode) {
        RunMode.Action -> {
            put("action", action.trimmingWhitespace())
            if (actionPrompt.isNotEmpty()) put("prompt", actionPrompt)
        }

        RunMode.Cmd -> put("cmd", cmd.trimmingWhitespace())

        RunMode.Prompt -> {
            put("prompt", prompt.trimmingWhitespace())
            agent.trimmingWhitespace().takeIf { it.isNotEmpty() }?.let { put("agent", it) }
            model.trimmingWhitespace().takeIf { it.isNotEmpty() }?.let { put("model", it) }
            effort.trimmingWhitespace().takeIf { it.isNotEmpty() }?.let { put("effort", it) }
            if (readOnly) put("access", "read")
            if (quiet) put("quiet", true)
            if (memory) put("memory", true)
            val claude = agent.trimmingWhitespace().let { it.isEmpty() || it == "claude" }
            if (claude) claudeAccount?.let { put("claudeAccount", it) }
        }
    }
}

/**
 * A plain copy with default options stays `duplicate: true`, the form every build can
 * read; the mapping is written only once an option departs from its default.
 */
private fun JobEditorDraft.buildDuplicate(): JsonElement? {
    if (duplicateMode == DuplicateMode.None) return null
    val options = buildJsonObject {
        if (duplicateMode == DuplicateMode.Worktree) {
            put("mode", "worktree")
        } else {
            duplicatePullLatest?.let { put("pullLatest", it) }
            duplicateExcludeUncommitted?.let { put("excludeUncommitted", it) }
        }
        duplicateReinstallDeps?.let { put("reinstallDeps", it) }
    }
    return if (options.isEmpty()) JsonPrimitive(true) else options
}

/**
 * Whether a schedule uses anything beyond weekdays, one time or window, and a plain
 * interval — the shapes this editor can rebuild faithfully.
 */
internal fun scheduleNeedsMac(schedule: JsonObject): Boolean {
    if (schedule["cron"] != null || schedule["on"] != null) return true
    if (schedule["at"] is JsonArray || schedule["shortMonths"] != null) return true
    if (schedule["every"] != null) {
        return schedule["at"] != null || schedule["until"] != null || schedule["days"] != null
    }
    val days = schedule["days"]
    if (days.asString() != null) return true
    if (days is JsonArray) return days.any { describing(it).lowercase() !in WEEKDAYS }
    return false
}

/**
 * `every` is a string like "6h"/"2d" or a bare number read as hours, or a band
 * ("4h-8h", "4-8h") whose ends may share one unit written on the far side.
 */
internal fun parseEvery(every: JsonElement): Triple<Int, IntervalUnit, Int?> {
    every.asInt()?.let { return Triple(maxOf(1, it), IntervalUnit.Hours, null) }
    if (every.asString() == null) {
        every.asNumber()?.let { return Triple(maxOf(1, it.toInt()), IntervalUnit.Hours, null) }
    }
    val fallback = Triple(6, IntervalUnit.Hours, null)
    val s = describing(every).trimSpaces().lowercase()
    val ends = s.split("-", limit = 2).map { it.trimSpaces() }
    val first = ends.firstOrNull()?.takeIf { it.isNotEmpty() } ?: return fallback
    val unit = unitOf(if (ends.size == 2) ends[1] else first)
    val value = parseCount(first) ?: return fallback
    val max = if (ends.size == 2) parseCount(ends[1]) else null
    return Triple(value, unit, max?.let { maxOf(value, it) })
}

private fun unitOf(s: String): IntervalUnit = when {
    s.endsWith("d") -> IntervalUnit.Days
    s.endsWith("m") -> IntervalUnit.Minutes
    else -> IntervalUnit.Hours
}

private fun parseCount(s: String): Int? {
    val digits = if (s.endsWith("d") || s.endsWith("h") || s.endsWith("m")) s.dropLast(1) else s
    return digits.trimSpaces().toIntOrNull()?.let { maxOf(1, it) }
}

/** Swift's `trimmingCharacters(in: .whitespaces)`: spaces and tabs, not newlines. */
private fun String.trimSpaces(): String = trim(' ', '\t')

/** Swift's `String(describing:)` over a JSON value: a string as itself, else its text. */
private fun describing(e: JsonElement): String =
    e.asString() ?: e.asLong()?.toString() ?: (e as? JsonPrimitive)?.content ?: e.toString()

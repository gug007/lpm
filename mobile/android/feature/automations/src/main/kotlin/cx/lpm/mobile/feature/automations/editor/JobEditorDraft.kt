package cx.lpm.mobile.feature.automations.editor

import cx.lpm.mobile.core.model.trimmingWhitespace
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

enum class ScheduleMode { Time, Interval, Manual }

/** The "Repeat" picker: a time schedule reads as every day or certain days. */
enum class RepeatChoice { Daily, Days, Interval, Manual }

enum class IntervalUnit(val suffix: String) { Minutes("m"), Hours("h"), Days("d") }

enum class RunMode { Prompt, Cmd, Action }

enum class DuplicateMode { None, Copy, Worktree }

/**
 * The editor's form (the desktop's JobDraft). The copy options, `sendTo`, memory, the
 * Claude account and an action's prompt have no control here, so they're carried
 * through a save untouched rather than dropped from the job.
 */
data class JobEditorDraft(
    val label: String = "",
    val emoji: String = "",
    val scheduleMode: ScheduleMode = ScheduleMode.Time,
    val time: String = "09:00",
    val days: List<String> = emptyList(),
    // Randomized timing, each behind its own flag so turning one off and back on
    // keeps what was set: `randomWindow` draws the time from `time`..`untilTime` and
    // spreads `timesPerDay` runs across it, `randomDays` uses only `pickDays` of the
    // days each week, `varyInterval` draws each gap from the interval's two ends.
    val randomWindow: Boolean = false,
    val untilTime: String = "17:00",
    val timesPerDay: Int = 1,
    val randomDays: Boolean = false,
    val pickDays: Int = 1,
    val intervalValue: Int = 6,
    val intervalUnit: IntervalUnit = IntervalUnit.Hours,
    val varyInterval: Boolean = false,
    val intervalMaxValue: Int = 12,
    val check: String = "",
    val verify: String = "",
    val duplicateMode: DuplicateMode = DuplicateMode.None,
    val duplicatePullLatest: Boolean? = null,
    val duplicateReinstallDeps: Boolean? = null,
    val duplicateExcludeUncommitted: Boolean? = null,
    val runMode: RunMode = RunMode.Prompt,
    val action: String = "",
    val cmd: String = "",
    val prompt: String = "",
    /** "" is the app's default agent. */
    val agent: String = "",
    val model: String = "",
    val effort: String = "",
    val readOnly: Boolean = false,
    /** Report only runs that found something (set on the Mac). */
    val quiet: Boolean = false,
    /** Each run recalls and saves the job's memory (set on the Mac). */
    val memory: Boolean = true,
    /** The Claude account its runs use (set on the Mac); null is the project's. */
    val claudeAccount: String? = null,
    /** Where results go (set on the Mac); null is lpm alone. */
    val sendTo: JsonElement? = null,
    /** "Runs in"; empty is standalone. */
    val targets: List<String> = emptyList(),
    /** "Runs on": hostIds, best first, "any" last; empty is every Mac that has it. */
    val machines: List<String> = emptyList(),
    /** The body had a `projects` list, so a global job's scope can be edited. */
    val hasProjectsKey: Boolean = false,
    /**
     * A schedule set on the Mac that this editor has no controls for (several times a
     * day, dates of the month, a one-off date, an interval held to some hours, cron).
     * It is written back exactly as read.
     */
    val keptSchedule: JsonObject? = null,
    /** The task an agent-launching action is handed, set on the Mac. */
    val actionPrompt: String = ""
) {
    val repeat: RepeatChoice
        get() = when (scheduleMode) {
            ScheduleMode.Manual -> RepeatChoice.Manual
            ScheduleMode.Interval -> RepeatChoice.Interval
            ScheduleMode.Time -> if (days.isEmpty()) RepeatChoice.Daily else RepeatChoice.Days
        }

    /** The days a random pick draws from: the ones selected, or all seven. */
    val dayPool: Int get() = if (days.isEmpty()) WEEKDAYS.size else days.size

    /** 0 is every day the job has, which is what no pick at all means. */
    val pickDaysChoice: Int get() = if (randomDays) minOf(pickDays, dayPool) else 0

    fun withRepeat(choice: RepeatChoice): JobEditorDraft = when (choice) {
        RepeatChoice.Manual -> copy(scheduleMode = ScheduleMode.Manual)

        RepeatChoice.Interval -> copy(scheduleMode = ScheduleMode.Interval)

        RepeatChoice.Daily -> copy(scheduleMode = ScheduleMode.Time, days = emptyList())

        RepeatChoice.Days -> copy(
            scheduleMode = ScheduleMode.Time,
            days = days.ifEmpty { listOf("mon") }
        )
    }

    fun withPickDays(n: Int): JobEditorDraft =
        copy(randomDays = n > 0, pickDays = if (n > 0) n else pickDays)

    fun toggleDay(day: String): JobEditorDraft =
        copy(days = if (day in days) days - day else days + day)

    fun withIntervalValue(value: Int): JobEditorDraft =
        copy(intervalValue = value, intervalMaxValue = maxOf(intervalMaxValue, value))

    fun withVaryInterval(on: Boolean): JobEditorDraft =
        copy(varyInterval = on, intervalMaxValue = maxOf(intervalMaxValue, intervalValue))

    /** A single emoji only, like the desktop's slot. */
    fun withEmoji(value: String): JobEditorDraft = copy(emoji = firstGrapheme(value))

    /** An action needs one project to run in; leaving that drops back to a prompt. */
    fun toggleTarget(name: String): JobEditorDraft {
        val next = if (name in targets) targets - name else targets + name
        val mode = if (next.size != 1 && runMode == RunMode.Action) RunMode.Prompt else runMode
        return copy(targets = next, runMode = mode)
    }

    /** Only Claude and Codex take a reasoning effort (the default agent is Claude). */
    val effortAvailable: Boolean get() = agent.isEmpty() || agent == "claude" || agent == "codex"

    /**
     * The levels the agent and model accept — an unsupported one fails the run rather
     * than falling back. Every Claude model goes to Max; Codex needs a supported pinned
     * model for its top two. An unpinned agent gets only the levels both CLIs share.
     */
    val effortOptions: List<String>
        get() {
            val m = model.trimmingWhitespace().lowercase()
            return buildList {
                addAll(listOf("", "low", "medium", "high", "xhigh"))
                if (agent == "claude" || (agent == "codex" && m in CODEX_MAX_MODELS)) add("max")
                if (agent == "codex" && m in CODEX_ULTRA_MODELS) add("ultra")
            }
        }

    /** A picked agent or model can rule out the effort; it falls back to the default. */
    fun clampedEffort(): JobEditorDraft = when {
        !effortAvailable -> copy(effort = "")
        effort !in effortOptions -> copy(effort = "")
        else -> this
    }

    /** Why Save is off, or null when the job can be saved. */
    fun validationError(standalone: Boolean): String? {
        if (label.trimmingWhitespace().isEmpty()) return "Give this automation a name."
        if (standalone &&
            runMode == RunMode.Action
        ) {
            return "Standalone automations can't run an action."
        }
        if (keptSchedule == null) scheduleError()?.let { return it }
        return when (runMode) {
            RunMode.Action -> "Choose an action to run.".takeIf { action.isBlankTrimmed() }
            RunMode.Cmd -> "Enter a command to run.".takeIf { cmd.isBlankTrimmed() }
            RunMode.Prompt -> "Enter a prompt to run.".takeIf { prompt.isBlankTrimmed() }
        }
    }

    private fun scheduleError(): String? {
        when (scheduleMode) {
            ScheduleMode.Time -> {
                val at = parseTimeMinutes(time) ?: return "Pick a valid time."
                if (randomWindow) {
                    val until = parseTimeMinutes(untilTime)
                        ?: return "Pick a valid time for the end of the window."
                    if (until <= at) return "The window has to end after it starts."
                    if ((until - at) * 60 / maxOf(1, timesPerDay) < MIN_INTERVAL_SECS) {
                        return "That's more runs than the window has room for."
                    }
                }
                if (randomDays && pickDays < 1) return "Pick at least one day."
            }

            ScheduleMode.Interval -> {
                if (intervalValue < 1) return "The interval must be at least 1."
                if (varyInterval && intervalMaxValue < intervalValue) {
                    return "The longest gap has to be at least the shortest."
                }
            }

            ScheduleMode.Manual -> Unit
        }
        return null
    }

    companion object
}

private fun String.isBlankTrimmed(): Boolean = trimmingWhitespace().isEmpty()

val WEEKDAYS = listOf("mon", "tue", "wed", "thu", "fri", "sat", "sun")

/** The scheduler's floor, and the least room one run needs in a window (jobs.rs). */
private const val MIN_INTERVAL_SECS = 300

private val CODEX_MAX_MODELS = setOf(
    "gpt-6.2-sol",
    "gpt-6.2-astra",
    "gpt-6.1-terra",
    "gpt-6.1-sol",
    "gpt-6-astra",
    "gpt-6-sol",
    "gpt-6-luna",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna"
)
private val CODEX_ULTRA_MODELS = setOf(
    "gpt-6.2-sol",
    "gpt-6.2-astra",
    "gpt-6.1-terra",
    "gpt-6.1-sol",
    "gpt-6-astra",
    "gpt-6-sol",
    "gpt-5.6-sol",
    "gpt-5.6-terra"
)

package cx.lpm.mobile.feature.automations.format

import cx.lpm.mobile.core.model.AUTOMATION_WAITING_LABEL
import cx.lpm.mobile.core.model.AutomationHistoryEntry
import cx.lpm.mobile.core.model.AutomationJob

/** The colors a job's state and a run's result are drawn in. */
enum class AutomationTone { Green, Red, Orange, Blue, Secondary }

/**
 * What a job's row says under its name: broken, running, off, why its last run
 * failed, or when it runs next.
 */
fun automationStatusText(job: AutomationJob, now: AutomationClock): String {
    if (!job.valid) return job.error.ifEmpty { "Invalid automation" }
    job.ask?.let { return "$AUTOMATION_WAITING_LABEL · ${it.summary}" }
    if (job.running) return "Running"
    if (!job.enabled) return "Off · ${automationScheduleText(job)}"
    if (automationLastRunFailed(job)) return automationFailureText(job)
    val next = job.nextFireAt ?: return automationScheduleText(job)
    return "${automationScheduleText(job)} · ${now.relative(next)}"
}

fun automationStatusTone(job: AutomationJob): AutomationTone = when {
    !job.valid -> AutomationTone.Red
    job.ask != null -> AutomationTone.Orange
    job.running -> AutomationTone.Blue
    !job.enabled -> AutomationTone.Secondary
    else -> automationResultTone(job.lastResult)
}

fun automationResultTone(result: String): AutomationTone = when (result) {
    "completed", "found-work" -> AutomationTone.Green

    in automationFailedResults -> AutomationTone.Red

    "skipped-overlap", "skipped-pending-copy", "skipped-capacity", "pending-window" ->
        AutomationTone.Orange

    else -> AutomationTone.Secondary
}

fun automationResultLabel(result: String): String = when (result) {
    "nothing-to-do" -> "Nothing to do"
    "found-work" -> "Found work"
    "completed" -> "Done"
    "error" -> "Problem during the run"
    "canceled" -> "Stopped"
    "timed-out" -> "Stopped — ran too long"
    "context-full" -> "Conversation full"
    "skipped-overlap" -> "Skipped — still running"
    "skipped-pending-copy" -> "Waiting for the previous copy"
    "skipped-capacity" -> "Waiting — other automations were running"
    "pending-window" -> "Waiting for the app window"
    else -> result.ifEmpty { "No runs yet" }
}

/**
 * What a finished run is called once its own check has had a say. "Done" alone says
 * the agent exited, not that it did what it was asked.
 */
fun automationEntryLabel(entry: AutomationHistoryEntry): String {
    if (entry.waiting) return AUTOMATION_WAITING_LABEL
    val base = automationResultLabel(entry.result)
    val verified = entry.verified
    if (entry.result != "completed" || verified == null) return base
    return if (verified) "$base — checks passed" else "$base — checks failed"
}

/**
 * The list row's line under the name, with the count of what's waiting in front of
 * it, since that is why the row is at the top of the list.
 */
fun automationRowStatusText(job: AutomationJob, now: AutomationClock): String {
    val status = automationStatusText(job, now)
    if (job.unread <= 0 || job.running) return status
    val count = if (job.unread > MAX_COUNTED) "9+" else "${job.unread}"
    val noun = if (job.unread == 1) "message" else "messages"
    return "$count new $noun · $status"
}

/** The one line that answers "what is this doing right now" when not running. */
fun automationPillText(job: AutomationJob, now: AutomationClock): String = when {
    !job.valid -> "Can't run"
    job.ask != null -> AUTOMATION_WAITING_LABEL
    job.running -> "Running"
    !job.enabled -> "Off"
    else -> job.nextFireAt?.let { "Next run ${now.relative(it)}" } ?: "No run scheduled"
}

fun automationPillTone(job: AutomationJob): AutomationTone = when {
    !job.valid -> AutomationTone.Red
    job.ask != null -> AutomationTone.Orange
    job.running -> AutomationTone.Blue
    !job.enabled -> AutomationTone.Orange
    job.nextFireAt == null -> AutomationTone.Secondary
    else -> AutomationTone.Green
}

/** A run's tone once a question it asked still waits for an answer. */
fun automationEntryTone(entry: AutomationHistoryEntry): AutomationTone =
    if (entry.waiting) AutomationTone.Orange else automationResultTone(entry.result)

private const val MAX_COUNTED = 9

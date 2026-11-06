package cx.lpm.mobile.feature.automations.detail

import androidx.compose.runtime.Immutable
import cx.lpm.mobile.core.data.automations.AutomationsState
import cx.lpm.mobile.core.data.automations.automationKey
import cx.lpm.mobile.core.model.AUTOMATION_WAITING_LABEL
import cx.lpm.mobile.core.model.AutomationJob
import cx.lpm.mobile.feature.automations.format.AutomationClock
import cx.lpm.mobile.feature.automations.format.AutomationMachines
import cx.lpm.mobile.feature.automations.format.AutomationThread
import cx.lpm.mobile.feature.automations.format.AutomationTone
import cx.lpm.mobile.feature.automations.format.automationAgentText
import cx.lpm.mobile.feature.automations.format.automationDurationText
import cx.lpm.mobile.feature.automations.format.automationEntryLabel
import cx.lpm.mobile.feature.automations.format.automationFirstLine
import cx.lpm.mobile.feature.automations.format.automationMatching
import cx.lpm.mobile.feature.automations.format.automationPillText
import cx.lpm.mobile.feature.automations.format.automationPillTone
import cx.lpm.mobile.feature.automations.format.automationResultLabel
import cx.lpm.mobile.feature.automations.format.automationResultTone
import cx.lpm.mobile.feature.automations.format.automationRunPlaceText
import cx.lpm.mobile.feature.automations.format.automationScheduleText
import cx.lpm.mobile.feature.automations.format.automationScopeText
import cx.lpm.mobile.feature.automations.format.automationThreads
import cx.lpm.mobile.feature.automations.format.automationUsdText
import cx.lpm.mobile.feature.automations.ui.automationAskWhen

/** A moment on the right of a row: the clock time, and how long ago under it. */
@Immutable
data class TimeRowUi(val value: String, val detail: String, val tone: AutomationTone)

/** What the "Does" group holds; null when the job has nothing to say there. */
@Immutable
data class SetupUi(
    val summary: String,
    /** A command reads in monospace; a prompt doesn't. */
    val monospace: Boolean,
    /** The prompt's opening line, what the folded group shows. */
    val firstLine: String,
    val agent: String?,
    val duplicate: Boolean,
    val runsIn: String?,
    /** The computers it runs on, once there's more than one to name. */
    val runsOn: String? = null
)

/** One run (with its replies) in the history. */
@Immutable
data class RunRowUi(
    val rootAt: Long,
    val label: String,
    val tone: AutomationTone,
    val unread: Boolean,
    /** An agent's answer opens with its point, so its first line previews well. */
    val preview: String?,
    val meta: String
)

@Immutable
data class AutomationDetailUiState(
    val loaded: Boolean = false,
    val job: AutomationJob? = null,
    /** Run, stop or enable sent and not answered yet. */
    val pending: Boolean = false,
    val scheduleOpen: Boolean = false,
    val setupOpen: Boolean = false,
    val scope: String = "",
    val pill: String = "",
    val pillTone: AutomationTone = AutomationTone.Secondary,
    val schedule: String = "",
    val nextRun: String? = null,
    val lastRun: TimeRowUi? = null,
    val setup: SetupUi? = null,
    /** The run's output so far, while it runs. */
    val live: String? = null,
    /** What the run is doing or where it is, above its output. */
    val livePlace: String = "",
    val runs: List<RunRowUi> = emptyList(),
    val historyLoading: Boolean = false,
    val error: String? = null,
    /** Under the open question, what happens if nobody answers in time. */
    val askWhen: String = "",
    /** An answer is out and not acknowledged yet. */
    val answering: Boolean = false,
    val askError: String? = null
) {
    /** Where the job waits — the project its question is answered in. */
    val askProject: String get() = job?.ask?.project.orEmpty()
}

internal fun AutomationsState.detailState(
    project: String,
    jobId: String,
    clock: AutomationClock,
    scheduleOpen: Boolean,
    setupOpen: Boolean
): AutomationDetailUiState {
    val key = automationKey(project, jobId)
    val job = automationMatching(jobs, project, jobId)
    val entries = history[key]
    val base = AutomationDetailUiState(
        loaded = loaded,
        job = job,
        pending = key in pending,
        scheduleOpen = scheduleOpen,
        setupOpen = setupOpen,
        runs = automationThreads(entries.orEmpty())
            .sortedByDescending { it.tail.at }
            .map { it.row(previews = job?.runKind == "prompt", clock) },
        historyLoading = key in historyLoading && entries == null,
        error = error
    )
    if (job == null) return base
    val askKey = job.ask?.let { automationKey(it.project, jobId) }
    val lastRunAt = job.lastRunAt
    return base.copy(
        scope = automationScopeText(job),
        pill = automationPillText(job, clock),
        pillTone = automationPillTone(job),
        schedule = automationScheduleText(job),
        nextRun = job.nextFireAt?.takeIf { job.valid && job.enabled }?.let(clock::clock),
        lastRun = lastRunAt?.let {
            val ago = clock.relative(it)
            TimeRowUi(
                value = clock.clock(it),
                detail = if (job.lastResult.isEmpty()) {
                    ago
                } else {
                    "${automationResultLabel(job.lastResult)} · $ago"
                },
                tone = automationResultTone(job.lastResult)
            )
        },
        setup = job.setup(AutomationMachines.label(job, machines)),
        live = if (job.running) liveOutput[key]?.text.orEmpty() else null,
        livePlace = automationRunPlaceText(job),
        askWhen = job.ask?.let {
            automationAskWhen(it, clock.now.epochSecond, clock::clock)
        }.orEmpty(),
        answering = askKey != null && askKey in pending,
        askError = askKey?.let(askError::get)
    )
}

private fun AutomationJob.setup(runsOn: String?): SetupUi? {
    val showsAgent = runKind == "prompt"
    val showsTargets = runsIn.size > 1
    if (summary.isEmpty() && !showsAgent && !duplicate && !showsTargets &&
        runsOn == null
    ) {
        return null
    }
    return SetupUi(
        summary = summary,
        monospace = runKind == "cmd",
        firstLine = automationFirstLine(summary).orEmpty(),
        agent = if (showsAgent) automationAgentText(this) else null,
        duplicate = duplicate,
        runsIn = if (showsTargets) runsIn.joinToString(", ") else null,
        runsOn = runsOn
    )
}

private fun AutomationThread.row(previews: Boolean, clock: AutomationClock): RunRowUi {
    val entry = tail
    val meta = buildList {
        add(clock.clock(entry.at))
        if (root.ranOn.isNotEmpty()) add("on ${root.ranOn}")
        entry.durationSecs?.takeIf { it > 0 }?.let { add(automationDurationText(it)) }
        entry.costUsd?.takeIf { it > 0 }?.let { add(automationUsdText(it)) }
        if (entry.count > 1) add("×${entry.count}")
        if (replies.isNotEmpty()) {
            add("${replies.size} repl${if (replies.size == 1) "y" else "ies"}")
        }
        if (entry.copy.isNotEmpty()) add(entry.copy)
    }
    return RunRowUi(
        rootAt = root.at,
        label = if (waiting) AUTOMATION_WAITING_LABEL else automationEntryLabel(entry),
        tone = if (waiting) AutomationTone.Orange else automationResultTone(entry.result),
        unread = unread,
        preview = if (previews) automationFirstLine(entry.output) else null,
        meta = meta.joinToString(" · ")
    )
}

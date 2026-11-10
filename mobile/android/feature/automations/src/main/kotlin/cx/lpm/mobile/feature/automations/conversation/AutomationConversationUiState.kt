package cx.lpm.mobile.feature.automations.conversation

import androidx.compose.runtime.Immutable
import cx.lpm.mobile.core.data.automations.AutomationsState
import cx.lpm.mobile.core.data.automations.automationKey
import cx.lpm.mobile.core.model.AutomationAsk
import cx.lpm.mobile.core.model.AutomationHistoryEntry
import cx.lpm.mobile.core.model.AutomationJob
import cx.lpm.mobile.core.model.runningRunAsks
import cx.lpm.mobile.feature.automations.format.AutomationClock
import cx.lpm.mobile.feature.automations.format.AutomationThread
import cx.lpm.mobile.feature.automations.format.AutomationTone
import cx.lpm.mobile.feature.automations.format.automationCurrencyText
import cx.lpm.mobile.feature.automations.format.automationDurationText
import cx.lpm.mobile.feature.automations.format.automationEntryLabel
import cx.lpm.mobile.feature.automations.format.automationEntryTone
import cx.lpm.mobile.feature.automations.format.automationMatching
import cx.lpm.mobile.feature.automations.format.automationResultTone
import cx.lpm.mobile.feature.automations.format.automationThreads
import cx.lpm.mobile.feature.automations.ui.automationAskWhen

/** One turn of the conversation: what it was asked, how it went, what it said. */
@Immutable
data class MessageUi(
    val at: Long,
    val question: String,
    val output: String,
    /** A reply that simply finished keeps its status line under the answer, quietly. */
    val quiet: Boolean,
    val label: String,
    val tone: AutomationTone,
    /** The computer that made this run when it wasn't this Mac. */
    val ranOn: String? = null,
    val duration: String?,
    val cost: String?,
    val condensed: Boolean,
    val clock: String,
    /** What the run asked the user, with how each ended. */
    val asks: List<AutomationAsk> = emptyList()
)

@Immutable
data class AutomationConversationUiState(
    val job: AutomationJob? = null,
    val messages: List<MessageUi> = emptyList(),
    /** A reply sent and not in the history yet. */
    val pendingMessage: String? = null,
    /** The run's output so far. */
    val live: String = "",
    /** Replies wait while one is out or the automation runs. */
    val sending: Boolean = false,
    val followupError: String? = null,
    /** An answer is out and not acknowledged yet. */
    val answering: Boolean = false,
    val askError: String? = null,
    /** Per question, measured now: what happens if nobody answers in time, or when it settled. */
    val askWhen: Map<String, String> = emptyMap(),
    /** Opened on the run still going, before it lands in a run of its own. */
    val liveRun: Boolean = false,
    /** The questions the run going now asked, shown after what it has said. */
    val runAsks: List<AutomationAsk> = emptyList()
) {
    val running: Boolean get() = job?.running == true

    /** Only an agent's run can be answered. */
    val showsComposer: Boolean get() = job?.runKind == "prompt"

    /** A question in the conversation still waits for an answer. */
    val waiting: Boolean get() = messages.any { m -> m.asks.any { it.isOpen } }
}

/** Where a run still going is opened: it has no entry of its own until it ends. */
const val AUTOMATION_LIVE_RUN = -1L

/**
 * The conversation opened, by its root's `at`. Opened on [AUTOMATION_LIVE_RUN], it's
 * the run that started at [liveSince] once it has landed: the newest one since.
 */
internal fun AutomationsState.thread(
    project: String,
    jobId: String,
    rootAt: Long,
    liveSince: Long
): AutomationThread? {
    val threads = automationThreads(history[automationKey(project, jobId)].orEmpty())
    if (rootAt != AUTOMATION_LIVE_RUN) return threads.firstOrNull { it.root.at == rootAt }
    if (automationMatching(jobs, project, jobId)?.running == true) return null
    return threads.filter { it.tail.at >= liveSince }.maxByOrNull { it.tail.at }
}

internal fun AutomationsState.conversationState(
    project: String,
    jobId: String,
    rootAt: Long,
    pendingMessage: String?,
    clock: AutomationClock,
    liveSince: Long
): AutomationConversationUiState {
    val key = automationKey(project, jobId)
    val job = automationMatching(jobs, project, jobId)
    val thread = thread(project, jobId, rootAt, liveSince)
    val entries = thread?.entries.orEmpty()
    val isLive = rootAt == AUTOMATION_LIVE_RUN
    val runAsks = job?.runningRunAsks.orEmpty()
    val askWhen = (entries.flatMap { it.asks } + runAsks).associate {
        it.id to automationAskWhen(it, clock.now.epochSecond, clock::clock)
    }
    return AutomationConversationUiState(
        job = job,
        messages = entries.map { it.message(isRoot = it.at == thread?.root?.at, clock) },
        pendingMessage = pendingMessage,
        live = liveOutput[key]?.text.orEmpty(),
        sending = pendingMessage != null || job?.running == true || key in pending,
        followupError = followupError[key],
        answering = key in pending,
        askError = askError[key],
        askWhen = askWhen,
        liveRun = isLive,
        runAsks = if (isLive || pendingMessage != null) runAsks else emptyList()
    )
}

private fun AutomationHistoryEntry.message(isRoot: Boolean, clock: AutomationClock) = MessageUi(
    at = at,
    // An answer to a question shows on the question itself.
    question = if (answerTo.isEmpty()) question else "",
    output = output,
    quiet = !isRoot && result == "completed",
    label = automationEntryLabel(this),
    tone = automationEntryTone(this),
    ranOn = ranOn.ifEmpty { null }?.let { "on $it" },
    duration = durationSecs?.let(::automationDurationText),
    cost = costUsd?.let(::automationCurrencyText),
    condensed = compacted,
    clock = clock.clock(at),
    asks = asks
)

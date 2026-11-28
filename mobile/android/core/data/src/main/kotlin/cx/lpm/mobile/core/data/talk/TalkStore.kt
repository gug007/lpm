package cx.lpm.mobile.core.data.talk

import cx.lpm.mobile.core.data.agents.AgentLaunchStore
import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.talkPlan
import cx.lpm.mobile.core.data.client.talkRun
import cx.lpm.mobile.core.data.dictation.plusDictated
import cx.lpm.mobile.core.data.session.MacAnswer
import cx.lpm.mobile.core.data.session.MacRequestError
import cx.lpm.mobile.core.data.session.MacRequests
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.Haptic
import cx.lpm.mobile.core.model.HapticCue
import cx.lpm.mobile.core.model.TalkPlan
import cx.lpm.mobile.core.model.next
import cx.lpm.mobile.core.model.trimmingWhitespace
import cx.lpm.mobile.core.protocol.TalkPlanReply
import cx.lpm.mobile.core.protocol.TalkRunReply
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

sealed interface TalkPhase {
    data object Ask : TalkPhase

    data object Planning : TalkPhase

    data object Plan : TalkPhase

    data class Failed(val unsupported: Boolean, val message: String) : TalkPhase
}

data class TalkState(
    /** The live Mac turns a sentence into a plan and runs it. */
    val available: Boolean = false,
    /**
     * The sheet is up. Shut by Cancel, by a swipe down or by a run the Mac took, and
     * either way a reply still on its way is dropped.
     */
    val open: Boolean = false,
    val phase: TalkPhase = TalkPhase.Ask,
    val text: String = "",
    val plan: TalkPlan? = null,
    /** The projects the sentence could mean, when the plan names none. */
    val candidates: List<String> = emptyList(),
    val running: Boolean = false,
    val runError: String? = null,
    /** How the last run went, for the screen to play. */
    val feedback: HapticCue? = null
) {
    val hasText: Boolean get() = text.trimmingWhitespace().isNotEmpty()
}

/**
 * The Talk button's one request (iOS `TalkStore`): a sentence said or typed, the plan
 * the Mac makes of it, and the run once that plan is approved. Nothing reaches
 * `talkRun` that wasn't on screen when Approve was tapped.
 */
class TalkStore(private val session: MacSession) : SessionStore {
    private val mutable = MutableStateFlow(TalkState())
    val state: StateFlow<TalkState> = mutable.asStateFlow()

    private val plans = MacRequests<TalkPlanReply>(PLAN_TIMEOUT_MS)
    private val runs = MacRequests<TalkRunReply>(RUN_TIMEOUT_MS)

    // Bumped whenever the request on screen is left, so a late reply is dropped.
    private var turn = 0

    override fun wire(client: LpmClient) {
        client.onTalkPlan = { if (client === session.client) plans.deliver(it.reqId, it) }
        client.onTalkRun = { if (client === session.client) runs.deliver(it.reqId, it) }
    }

    override fun reset() {
        turn += 1
        failRequests()
        mutable.value = TalkState()
    }

    override fun onReady(client: LpmClient) {
        val available = client.hostFeatures.contains(LpmClient.TALK_FEATURE)
        mutable.update { it.copy(available = available) }
    }

    override fun onConnectionReset() = failRequests()

    private fun failRequests() {
        plans.failAll()
        runs.failAll()
    }

    fun begin() {
        mutable.update {
            it.copy(
                phase = TalkPhase.Ask,
                text = "",
                plan = null,
                candidates = emptyList(),
                runError = null,
                open = true
            )
        }
        session.store<AgentLaunchStore>().loadOptions()
    }

    fun close() {
        if (!state.value.open) return
        turn += 1
        failRequests()
        mutable.update { it.copy(open = false, running = false) }
    }

    fun tryAgain() {
        mutable.update { it.copy(phase = TalkPhase.Ask) }
    }

    fun setText(text: String) {
        mutable.update { it.copy(text = text) }
    }

    fun setProject(name: String) = editPlan { it.copy(project = name) }

    fun setAgent(id: String) = editPlan { it.copy(agent = id) }

    fun setPrompt(prompt: String) = editPlan { it.copy(prompt = prompt) }

    private fun editPlan(change: (TalkPlan) -> TalkPlan) {
        mutable.update { it.copy(plan = it.plan?.let(change)) }
    }

    /** A take's words go in the field and then to the Mac, as if Make a plan was tapped. */
    fun insertDictated(words: String) {
        val s = state.value
        if (!s.open || s.phase != TalkPhase.Ask) return
        mutable.update { it.copy(text = it.text.plusDictated(words)) }
        if (words.trimmingWhitespace().isNotEmpty()) makePlan()
    }

    fun makePlan() {
        val s = state.value
        val sentence = s.text.trimmingWhitespace()
        if (s.phase != TalkPhase.Ask || sentence.isEmpty()) return
        mutable.update { it.copy(phase = TalkPhase.Planning) }
        val turn = turn
        session.scope.launch {
            val answer = plans.ask { session.client?.talkPlan(it, sentence) }
            if (turn != this@TalkStore.turn) return@launch
            mutable.update { it.planned(answer) }
        }
    }

    fun approve() {
        val s = state.value
        val shown = s.plan?.takeIf { it.canRun } ?: return
        if (s.phase != TalkPhase.Plan || s.running) return
        if (!session.link.isReady) {
            mutable.update { it.copy(runError = MacRequestError.Disconnected.message) }
            return
        }
        val plan = shown.copy(prompt = shown.prompt.trimmingWhitespace())
        mutable.update { it.copy(running = true, runError = null) }
        val turn = turn
        session.scope.launch {
            val answer = runs.ask { session.client?.talkRun(it, plan) }
            if (turn != this@TalkStore.turn) return@launch
            val failure = when (answer) {
                is MacAnswer.Reply -> answer.value.error
                is MacAnswer.None -> answer.why.message
            }
            mutable.update {
                it.copy(
                    running = false,
                    runError = failure,
                    feedback = it.feedback.next(
                        if (failure == null) Haptic.Success else Haptic.Error
                    )
                )
            }
            if (failure == null) close()
        }
    }

    private fun TalkState.planned(answer: MacAnswer<TalkPlanReply>): TalkState {
        val reply = when (answer) {
            is MacAnswer.Reply -> answer.value
            is MacAnswer.None -> return copy(phase = TalkPhase.Failed(false, answer.why.message))
        }
        val plan = reply.plan
            ?: return copy(phase = TalkPhase.Failed(reply.unsupported, reply.error))
        return copy(
            plan = plan,
            candidates = reply.candidates,
            runError = null,
            phase = TalkPhase.Plan
        )
    }

    private companion object {
        const val PLAN_TIMEOUT_MS = 120_000L
        const val RUN_TIMEOUT_MS = 30_000L
    }
}

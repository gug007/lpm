package cx.lpm.mobile.feature.automations.conversation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.automations.AutomationsStore
import cx.lpm.mobile.core.data.automations.automationKey
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.navigation.AutomationRunKey
import cx.lpm.mobile.feature.automations.format.AutomationClock
import cx.lpm.mobile.feature.automations.format.automationMatching
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Clock
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.stateIn
import kotlinx.serialization.json.JsonObject

/**
 * One run of an automation as a conversation (iOS `AutomationConversationView`): what
 * it was asked, what it said, and the replies that continued it.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel(assistedFactory = AutomationConversationViewModel.Factory::class)
class AutomationConversationViewModel @AssistedInject constructor(
    @Assisted val key: AutomationRunKey,
    private val sessions: MacSessions,
    private val clock: Clock
) : ViewModel() {
    private val session: MacSession? get() = sessions[key.session]
    private val store: AutomationsStore? get() = session?.store()

    /** The reply sent, and how many messages the run had when it went. */
    private val pending = MutableStateFlow<Pair<String, Int>?>(null)

    /** When the run opened on [AUTOMATION_LIVE_RUN] started; the run it lands in ends after it. */
    private val liveSince: Long = store?.state?.value
        ?.let { automationMatching(it.jobs, key.project, key.jobId)?.runningSince }
        ?: 0

    val uiState: StateFlow<AutomationConversationUiState> = sessions.session(key.session)
        .flatMapLatest { s ->
            s?.let(::conversationState) ?: flowOf(AutomationConversationUiState())
        }
        .stateIn(
            viewModelScope,
            SharingStarted.WhileSubscribed(5_000),
            AutomationConversationUiState()
        )

    init {
        // The reply shows as sent until the Mac's answer lands in the history, or fails.
        val failure = automationKey(key.project, key.jobId)
        store?.state
            ?.onEach { a ->
                val (_, base) = pending.value ?: return@onEach
                val count =
                    a.thread(key.project, key.jobId, key.rootAt, liveSince)?.entries?.size ?: 0
                if (count > base || failure in a.followupError) pending.value = null
            }
            ?.launchIn(viewModelScope)
        // A run that ends lands in the history, which the page then shows.
        store?.state
            ?.map { a -> automationMatching(a.jobs, key.project, key.jobId)?.running == true }
            ?.distinctUntilChanged()
            ?.drop(1)
            ?.onEach { running -> if (!running) store?.loadHistory(key.project, key.jobId) }
            ?.launchIn(viewModelScope)
    }

    private fun conversationState(s: MacSession) = combine(
        s.store<AutomationsStore>().state,
        pending
    ) { a, p ->
        a.conversationState(
            key.project,
            key.jobId,
            key.rootAt,
            p?.first,
            AutomationClock(clock.instant(), clock.zone),
            liveSince
        )
    }

    /**
     * Opening a run reads it, and everything under it. Arriving on the automation's
     * page reads nothing, so its list keeps pointing at what hasn't been looked at.
     */
    fun load() {
        val s = store ?: return
        val state = s.state.value
        val job = automationMatching(state.jobs, key.project, key.jobId)
        val thread = state.thread(key.project, key.jobId, key.rootAt, liveSince)
        if (job != null && thread != null && thread.unread) s.markSeen(job, upTo = thread.tail.at)
        s.loadHistory(key.project, key.jobId)
        s.loadLiveOutput(key.project, key.jobId)
    }

    fun loadLiveOutput() {
        store?.loadLiveOutput(key.project, key.jobId)
    }

    /** Continue the conversation from its latest turn, with the automation's agent. */
    fun send(message: String) {
        val s = store ?: return
        val state = s.state.value
        val job = automationMatching(state.jobs, key.project, key.jobId) ?: return
        val thread = state.thread(key.project, key.jobId, key.rootAt, liveSince) ?: return
        pending.value = message to thread.entries.size
        s.sendFollowup(
            key.project,
            key.jobId,
            thread.tail.at,
            message,
            job.agent,
            job.model,
            job.effort
        )
    }

    /** Answer the run's question; the first answer from any device wins. */
    fun answer(askId: String, answers: JsonObject) {
        store?.answerQuestion(key.project, key.jobId, askId, answers)
    }

    fun dismiss(askId: String) {
        store?.dismissQuestion(key.project, key.jobId, askId)
    }

    fun dismissFollowupError() {
        store?.dismissFollowupError(key.project, key.jobId)
    }

    @AssistedFactory
    interface Factory {
        fun create(key: AutomationRunKey): AutomationConversationViewModel
    }
}

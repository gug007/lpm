package cx.lpm.mobile.feature.automations.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.automations.AutomationsStore
import cx.lpm.mobile.core.data.prefs.AppPreferences
import cx.lpm.mobile.core.data.prefs.PreferenceKeys
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.navigation.AutomationKey
import cx.lpm.mobile.feature.automations.format.AutomationClock
import cx.lpm.mobile.feature.automations.format.automationMatching
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Clock
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.runningFold
import kotlinx.coroutines.flow.stateIn
import kotlinx.serialization.json.JsonObject

/**
 * One automation's page (iOS `AutomationDetailView`): its state, schedule and setup,
 * the run going on now and every run it has made.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel(assistedFactory = AutomationDetailViewModel.Factory::class)
class AutomationDetailViewModel @AssistedInject constructor(
    @Assisted val key: AutomationKey,
    private val sessions: MacSessions,
    private val prefs: AppPreferences,
    private val clock: Clock
) : ViewModel() {
    private val session: MacSession? get() = sessions[key.session]
    private val store: AutomationsStore? get() = session?.store()

    // The groups stay folded by default so the runs start near the top; the reader's
    // choice sticks across automations.
    private val folds = prefs.data.map {
        (prefs.bool(PreferenceKeys.AUTOMATION_SCHEDULE_OPEN) ?: false) to
            (prefs.bool(PreferenceKeys.AUTOMATION_SETUP_OPEN) ?: false)
    }

    val uiState: StateFlow<AutomationDetailUiState> = sessions.session(key.session)
        .flatMapLatest { s -> s?.let(::detailState) ?: flowOf(AutomationDetailUiState()) }
        .stateIn(
            viewModelScope,
            SharingStarted.WhileSubscribed(5_000),
            AutomationDetailUiState()
        )

    init {
        // A run that just finished has landed in the history: fetch it.
        store?.state
            ?.map { automationMatching(it.jobs, key.project, key.jobId)?.running }
            ?.distinctUntilChanged()
            ?.runningFold(null as Boolean? to null as Boolean?) { (_, last), now -> last to now }
            ?.onEach { (was, now) -> if (was == true && now == false) loadHistory() }
            ?.launchIn(viewModelScope)
    }

    private fun detailState(s: MacSession) = combine(
        s.store<AutomationsStore>().state,
        folds
    ) { a, (scheduleOpen, setupOpen) ->
        a.detailState(
            key.project,
            key.jobId,
            AutomationClock(clock.instant(), clock.zone),
            scheduleOpen,
            setupOpen
        )
    }

    /** The page came up: the list, this job's runs, and its output if it's running. */
    fun load() {
        val s = store ?: return
        s.load()
        s.loadHistory(key.project, key.jobId)
        s.loadLiveOutput(key.project, key.jobId)
    }

    fun loadLiveOutput() {
        store?.loadLiveOutput(key.project, key.jobId)
    }

    suspend fun refresh() {
        store?.refresh()
        loadHistory()
    }

    fun setEnabled(enabled: Boolean) {
        val job = uiState.value.job ?: return
        store?.setEnabled(job, enabled)
    }

    /** The pinned bar's one action: stop a run, start one, or turn the job back on. */
    fun runBarTapped() {
        val job = uiState.value.job ?: return
        val s = store ?: return
        when {
            job.running -> s.stop(job)
            job.enabled -> s.run(job)
            else -> s.setEnabled(job, true)
        }
    }

    fun takeOver() {
        uiState.value.job?.let { store?.takeOver(it) }
    }

    /** Answer the job's open question where it waits; the first answer from any device wins. */
    fun answer(askId: String, answers: JsonObject) {
        store?.answerQuestion(uiState.value.askProject, key.jobId, askId, answers)
    }

    fun dismissQuestion(askId: String) {
        store?.dismissQuestion(uiState.value.askProject, key.jobId, askId)
    }

    fun markRead() {
        uiState.value.job?.let { store?.markSeen(it) }
    }

    fun setScheduleOpen(open: Boolean) {
        prefs.setBool(PreferenceKeys.AUTOMATION_SCHEDULE_OPEN, open)
    }

    fun setSetupOpen(open: Boolean) {
        prefs.setBool(PreferenceKeys.AUTOMATION_SETUP_OPEN, open)
    }

    fun dismissError() {
        store?.dismissError()
    }

    private fun loadHistory() {
        store?.loadHistory(key.project, key.jobId)
    }

    @AssistedFactory
    interface Factory {
        fun create(key: AutomationKey): AutomationDetailViewModel
    }
}

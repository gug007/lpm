package cx.lpm.mobile.feature.projects.talk

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.agents.AgentLaunchStore
import cx.lpm.mobile.core.data.dictation.DictationMeter
import cx.lpm.mobile.core.data.dictation.DictationState
import cx.lpm.mobile.core.data.dictation.DictationStore
import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.talk.TalkState
import cx.lpm.mobile.core.data.talk.TalkStore
import cx.lpm.mobile.core.model.SessionKey
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn

/** One row of a plan's Change menu: a project by name, or an agent by id. */
data class TalkChoice(val id: String, val title: String)

data class TalkUiState(
    /**
     * The button is on the list: the live Mac can turn a request into a plan. A Mac
     * that's away can't plan, but its sheet stays up through a dropped link.
     */
    val offered: Boolean = false,
    val talk: TalkState = TalkState(),
    /** The Change menu's projects: the ones the sentence could mean, then the rest. */
    val projects: List<TalkChoice> = emptyList(),
    val agents: List<TalkChoice> = emptyList()
) {
    val open: Boolean get() = talk.open

    fun projectTitle(name: String): String = projects.firstOrNull { it.id == name }?.title ?: name

    fun agentLabel(id: String): String = agents.firstOrNull { it.id == id }?.title ?: id
}

/** The Talk button on the live Mac's projects list and its sheet (iOS `TalkButton`). */
@HiltViewModel
class TalkViewModel @Inject constructor(
    session: MacSession,
    private val dictation: DictationStore
) : ViewModel() {
    private val talk: TalkStore = session.store()

    val dictationState: StateFlow<DictationState> get() = dictation.state
    val dictationMeter: DictationMeter get() = dictation.meter
    val needsMicrophone: Boolean get() = dictation.needsMicrophone

    val uiState: StateFlow<TalkUiState> = combine(
        talk.state,
        session.store<ProjectsStore>().state,
        session.store<AgentLaunchStore>().state,
        session.state,
        session.link.views
    ) { t, p, agents, s, link ->
        val listed = p.projects
        val meant = t.candidates.mapNotNull { name -> listed.firstOrNull { it.name == name } }
        TalkUiState(
            offered = t.available && listed.isNotEmpty() &&
                (t.open || s.isReady || link.quietReconnect),
            talk = t,
            projects = (meant + listed).distinctBy { it.name }.map {
                TalkChoice(it.name, it.label.ifEmpty { it.name })
            },
            agents = agents.options.orEmpty().map { TalkChoice(it.id, it.label) }
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), TalkUiState())

    fun begin() = talk.begin()

    /** The sentence goes with the sheet, so a take that's still running goes too. */
    fun close() {
        talk.close()
        abandonDictation()
    }

    fun tryAgain() = talk.tryAgain()

    fun setText(text: String) = talk.setText(text)

    fun makePlan() = talk.makePlan()

    fun setProject(name: String) = talk.setProject(name)

    fun setAgent(id: String) = talk.setAgent(id)

    fun setPrompt(prompt: String) = talk.setPrompt(prompt)

    fun approve() = talk.approve()

    fun startDictation() = dictation.start(DICTATION_OWNER, SessionKey.Live, talk::insertDictated)

    fun stopDictation() = dictation.stop()

    fun cancelDictation() = dictation.cancel()

    fun refuseDictation() = dictation.refuse(DICTATION_OWNER)

    fun abandonDictation() = dictation.abandon(DICTATION_OWNER)

    companion object {
        const val DICTATION_OWNER = "talk"
    }
}

package cx.lpm.mobile.feature.memory.composer

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.model.HapticCue
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.trimmingWhitespace
import cx.lpm.mobile.feature.memory.data.MemoryState
import cx.lpm.mobile.feature.memory.data.MemoryStore
import cx.lpm.mobile.feature.memory.format.memoryInvocation
import cx.lpm.mobile.feature.memory.format.relativeMemoryTime
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
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn

/** One saved session in the picker: its title and when it was last written. */
@Immutable
data class PickerRowUi(val name: String, val title: String, val updated: String)

@Immutable
data class ComposerMemoryUiState(
    val sessions: List<PickerRowUi> = emptyList(),
    /** The rows the search leaves; all of them while it's empty. */
    val visible: List<PickerRowUi> = emptyList(),
    val query: String = "",
    val loading: Boolean = true,
    val feedback: HapticCue? = null
) {
    /** Below this a search field is more furniture than help (the desktop draws the line here). */
    val searchable: Boolean get() = sessions.size >= SEARCH_FROM

    private companion object {
        const val SEARCH_FROM = 4
    }
}

/**
 * The composer's memory picker (iOS `ComposerMemorySheet`): ask the agent to remember
 * this conversation, or hand it a saved session to continue from. What it writes into
 * the field is the terminal CLI's own invocation of the lpm-memory skill.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel(assistedFactory = ComposerMemoryViewModel.Factory::class)
class ComposerMemoryViewModel @AssistedInject constructor(
    @Assisted("project") private val project: String,
    @Assisted("cli") private val cli: String,
    @Assisted private val session: SessionKey,
    private val sessions: MacSessions,
    private val clock: Clock
) : ViewModel() {
    private val store: MemoryStore? get() = sessions[session]?.store()
    private val query = MutableStateFlow("")

    val uiState: StateFlow<ComposerMemoryUiState> = sessions.session(session)
        .flatMapLatest { s ->
            s?.store<MemoryStore>()?.state?.let { combine(it, query, ::pickerState) }
                ?: flowOf(ComposerMemoryUiState(loading = false))
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ComposerMemoryUiState())

    fun load() {
        store?.load(project)
    }

    fun setQuery(text: String) {
        query.value = text
    }

    /** "" asks the agent to remember this conversation; a name continues that session. */
    fun invocation(session: String): String = memoryInvocation(cli, session)

    fun delete(name: String) {
        store?.delete(project, name)
    }

    private fun pickerState(s: MemoryState, text: String): ComposerMemoryUiState {
        val now = clock.instant()
        val rows = s.sessions(project).map {
            PickerRowUi(it.name, it.title, relativeMemoryTime(it.updatedAt, now))
        }
        val term = text.trimmingWhitespace().lowercase()
        return ComposerMemoryUiState(
            sessions = rows,
            visible = if (term.isEmpty()) {
                rows
            } else {
                rows.filter { term in it.title.lowercase() || term in it.name.lowercase() }
            },
            query = text,
            // Not asked yet counts as loading, so "Nothing saved yet" doesn't flash first.
            loading = project in s.listLoading || (project !in s.lists && project !in s.listError),
            feedback = s.feedback
        )
    }

    @AssistedFactory
    interface Factory {
        fun create(
            @Assisted("project") project: String,
            @Assisted("cli") cli: String,
            session: SessionKey
        ): ComposerMemoryViewModel
    }
}

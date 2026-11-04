package cx.lpm.mobile.feature.commands.editor

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.commands.CommandOutcome
import cx.lpm.mobile.core.data.commands.LpmCommandsStore
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.model.CommandScope
import cx.lpm.mobile.core.model.Haptic
import cx.lpm.mobile.core.model.HapticCue
import cx.lpm.mobile.core.model.LpmCommandLists
import cx.lpm.mobile.core.model.next
import cx.lpm.mobile.core.model.trimmingWhitespace
import cx.lpm.mobile.core.navigation.CommandEditorKey
import cx.lpm.mobile.feature.commands.CommandsWatch
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Writes one lpm command (iOS `CommandEditorSheet`): its name, where it lives (a folder
 * of this project's list or the global one, so a save can move it between them), the
 * line the `/` menu shows beside it, and its prompt. The Mac writes the file.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel(assistedFactory = CommandEditorViewModel.Factory::class)
class CommandEditorViewModel @AssistedInject constructor(
    @Assisted key: CommandEditorKey,
    sessions: MacSessions
) : ViewModel() {
    internal val watch = CommandsWatch(sessions, key.session, key.project)
    private val project = key.project

    private val lists = sessions.session(key.session).flatMapLatest { s ->
        s?.store<LpmCommandsStore>()?.state?.map { it.lists[project] } ?: flowOf(null)
    }

    private val draft =
        MutableStateFlow(CommandDraft.of(key, watch.store?.state?.value?.lists?.get(project)))
    private val work = MutableStateFlow(Work())

    val uiState: StateFlow<CommandEditorUiState> = combine(draft, lists, work) { d, l, w ->
        CommandEditorUiState(
            draft = d,
            places = placesFor(d, l),
            canKeepOutOfGit = canKeepOutOfGit(d, l),
            warnCommitted = warnsCommitted(d, l),
            saving = w.saving,
            error = w.error,
            done = w.done,
            feedback = w.feedback
        )
    }.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        CommandEditorUiState(draft.value)
    )

    init {
        // A project whose own list can't be read leaves only the global one.
        viewModelScope.launch { lists.collect(::leaveMissingProjectList) }
    }

    /** Spaces can't be in a name, so they become dashes as they're typed. */
    fun setName(name: String) = draft.update { it.copy(name = name.replace(WHITESPACE, "-")) }

    fun setDescription(description: String) = draft.update { it.copy(description = description) }

    fun setBody(body: String) = draft.update { it.copy(body = body) }

    fun place(scope: CommandScope, folder: String?) =
        draft.update { it.copy(scope = scope, folder = folder) }

    fun setKeepOutOfGit(keep: Boolean) = draft.update { it.copy(keepOutOfGit = keep) }

    fun save() {
        val d = draft.value
        if (!d.isValid) return
        val keepOutOfGit = d.keepOutOfGit.takeIf { uiState.value.canKeepOutOfGit }
        commit { store ->
            store.save(
                project,
                d.place,
                d.description.trimmingWhitespace(),
                d.body,
                d.original,
                keepOutOfGit
            )
        }
    }

    /** Whether the Mac can turn this skill into an other skill. */
    val canConvert: Boolean get() = watch.store?.otherSkillsAvailable == true

    fun convert() {
        val target = draft.value.original ?: return
        commit { it.convert(project, target.scope, target.name, toLpm = false) }
    }

    fun delete() {
        val target = draft.value.original ?: return
        commit { it.delete(project, target) }
    }

    private fun commit(op: suspend (LpmCommandsStore) -> CommandOutcome<Unit>) {
        val store = watch.store ?: return
        if (work.value.saving) return
        work.update { it.copy(saving = true, error = null) }
        viewModelScope.launch {
            val outcome = op(store)
            work.update { w ->
                when (outcome) {
                    is CommandOutcome.Done -> w.copy(
                        saving = false,
                        done = true,
                        feedback = w.feedback.next(Haptic.Success)
                    )

                    is CommandOutcome.Failed -> w.copy(
                        saving = false,
                        error = outcome.error,
                        feedback = w.feedback.next(Haptic.Error)
                    )
                }
            }
        }
    }

    private fun leaveMissingProjectList(lists: LpmCommandLists?) {
        if (lists == null) return
        draft.update { d ->
            if (d.scope in lists.scopes) d else d.copy(scope = CommandScope.Global, folder = null)
        }
    }

    private data class Work(
        val saving: Boolean = false,
        val error: String? = null,
        val done: Boolean = false,
        val feedback: HapticCue? = null
    )

    @AssistedFactory
    interface Factory {
        fun create(key: CommandEditorKey): CommandEditorViewModel
    }

    private companion object {
        val WHITESPACE = Regex("\\s+")
    }
}

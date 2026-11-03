package cx.lpm.mobile.feature.commands.list

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.commands.CommandOutcome
import cx.lpm.mobile.core.data.commands.LpmCommandsStore
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.model.CommandScope
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.protocol.CommandFolderOp
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
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** A project's lpm commands (iOS `CommandsScreen`): both lists by folder, and folder changes. */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel(assistedFactory = CommandsViewModel.Factory::class)
class CommandsViewModel @AssistedInject constructor(
    @Assisted val project: String,
    @Assisted session: SessionKey,
    sessions: MacSessions
) : ViewModel() {
    internal val watch = CommandsWatch(sessions, session, project)

    private val picked = MutableStateFlow(CommandScope.Project)
    private val changeError = MutableStateFlow<String?>(null)

    val uiState: StateFlow<CommandsUiState> = sessions.session(session)
        .flatMapLatest { s ->
            val commands = s?.store<LpmCommandsStore>()?.state ?: return@flatMapLatest flowOf(
                CommandsUiState()
            )
            combine(commands, picked, changeError) { state, scope, error ->
                state.commandsUiState(project, scope, error)
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), CommandsUiState())

    fun pick(scope: CommandScope) {
        picked.value = scope
    }

    fun retry() {
        watch.store?.load(project)
    }

    fun createFolder(name: String) = change(CommandFolderOp.Create, name)

    fun renameFolder(folder: String, newName: String) =
        change(CommandFolderOp.Rename, folder, newName)

    fun deleteFolder(folder: String) = change(CommandFolderOp.Delete, folder)

    fun dismissError() {
        changeError.value = null
    }

    private fun change(op: CommandFolderOp, name: String, newName: String? = null) {
        val store = watch.store ?: return
        val scope = uiState.value.scope
        viewModelScope.launch {
            val outcome = store.folder(project, op, scope, name, newName)
            if (outcome is CommandOutcome.Failed) changeError.value = outcome.error
        }
    }

    @AssistedFactory
    interface Factory {
        fun create(project: String, session: SessionKey): CommandsViewModel
    }
}

package cx.lpm.mobile.feature.commands.folder

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.commands.LpmCommandsStore
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.model.CommandScope
import cx.lpm.mobile.core.model.LpmCommand
import cx.lpm.mobile.core.model.OtherSkill
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.feature.commands.CommandsWatch
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

/** The commands in one folder of one list (iOS `CommandFolderScreen`). */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel(assistedFactory = CommandFolderViewModel.Factory::class)
class CommandFolderViewModel @AssistedInject constructor(
    @Assisted("project") val project: String,
    @Assisted val scope: CommandScope,
    @Assisted("folder") val folder: String?,
    @Assisted session: SessionKey,
    sessions: MacSessions
) : ViewModel() {
    internal val watch = CommandsWatch(sessions, session, project)

    val commands: StateFlow<List<LpmCommand>> = sessions.session(session)
        .flatMapLatest { s ->
            s?.store<LpmCommandsStore>()?.state?.map { state ->
                state.lists[project]?.list(scope)?.inFolder(folder).orEmpty()
            } ?: flowOf(emptyList())
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    /** The skills not made in lpm filed here; No folder has its own Other skills page. */
    val others: StateFlow<List<OtherSkill>> = sessions.session(session)
        .flatMapLatest { s ->
            s?.store<LpmCommandsStore>()?.state?.map { state ->
                if (folder == null) {
                    emptyList()
                } else {
                    state.lists[project]?.list(scope)?.othersIn(folder).orEmpty()
                }
            } ?: flowOf(emptyList())
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    @AssistedFactory
    interface Factory {
        fun create(
            @Assisted("project") project: String,
            scope: CommandScope,
            @Assisted("folder") folder: String?,
            session: SessionKey
        ): CommandFolderViewModel
    }
}

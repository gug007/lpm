package cx.lpm.mobile.feature.commands.folder

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.commands.LpmCommandsStore
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.model.CommandScope
import cx.lpm.mobile.core.model.LpmCommand
import cx.lpm.mobile.core.model.OtherSkill
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.childFolder
import cx.lpm.mobile.feature.commands.CommandsWatch
import cx.lpm.mobile.feature.commands.list.FolderChanges
import cx.lpm.mobile.feature.commands.list.FolderRowUi
import cx.lpm.mobile.feature.commands.list.subfolderRows
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

/** One folder of one list: the folders inside it and its commands (iOS `CommandFolderScreen`). */
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

    private val folderChanges = FolderChanges(watch, viewModelScope) { scope }

    /** A refused folder change, to show. */
    val changeError: StateFlow<String?> = folderChanges.error

    /** No folder holds no folders, and a Mac on an older lpm keeps none inside another. */
    val canAddFolder: Boolean
        get() = folder != null && watch.store?.nestedFoldersAvailable == true

    /** The folders directly inside this one. */
    val subfolders: StateFlow<List<FolderRowUi>> = sessions.session(session)
        .flatMapLatest { s ->
            s?.store<LpmCommandsStore>()?.state?.map { state ->
                folder?.let { state.lists[project]?.list(scope)?.subfolderRows(it) }.orEmpty()
            } ?: flowOf(emptyList())
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val commands: StateFlow<List<LpmCommand>> = sessions.session(session)
        .flatMapLatest { s ->
            s?.store<LpmCommandsStore>()?.state?.map { state ->
                state.lists[project]?.list(scope)?.inFolder(folder).orEmpty()
            } ?: flowOf(emptyList())
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    /** The skills not made in lpm shown here; the rest have their Other skills page. */
    val others: StateFlow<List<OtherSkill>> = sessions.session(session)
        .flatMapLatest { s ->
            s?.store<LpmCommandsStore>()?.state?.map { state ->
                state.lists[project]?.list(scope)?.othersIn(folder).orEmpty()
            } ?: flowOf(emptyList())
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun createFolder(name: String) = folderChanges.create(childFolder(folder, name))

    fun renameFolder(folder: String, newName: String) = folderChanges.rename(folder, newName)

    fun deleteFolder(folder: String) = folderChanges.delete(folder)

    fun dismissError() = folderChanges.dismissError()

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

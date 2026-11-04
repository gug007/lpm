package cx.lpm.mobile.feature.commands.list

import androidx.compose.foundation.layout.RowScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.model.CommandScope
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.navigation.CommandEditorKey
import cx.lpm.mobile.core.navigation.CommandFolderKey
import cx.lpm.mobile.core.navigation.CommandsKey
import cx.lpm.mobile.core.navigation.OtherSkillsKey
import cx.lpm.mobile.feature.commands.editor.CommandEditorSheet
import cx.lpm.mobile.feature.commands.ui.BackButton
import cx.lpm.mobile.feature.commands.ui.rememberCommandsPage

/** The Commands screen pushed from the project menu. */
@Composable
fun CommandsRoute(
    key: CommandsKey,
    onOpenFolder: (CommandFolderKey) -> Unit,
    onOpenOthers: (OtherSkillsKey) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    CommandsHost(
        project = key.project,
        session = key.session,
        onOpenFolder = { scope, folder ->
            onOpenFolder(CommandFolderKey(key.project, scope, folder, key.session))
        },
        onOpenOthers = { scope -> onOpenOthers(OtherSkillsKey(key.project, scope, key.session)) },
        modifier = modifier,
        leading = { BackButton(onBack) }
    )
}

/**
 * The Commands screen wired to its ViewModel, the folder dialogs and the editor
 * sheet; [onOpenFolder] shows a folder's commands, [onOpenOthers] a list's other skills.
 */
@Composable
internal fun CommandsHost(
    project: String,
    session: SessionKey,
    onOpenFolder: (scope: CommandScope, folder: String?) -> Unit,
    onOpenOthers: (scope: CommandScope) -> Unit,
    leading: @Composable RowScope.() -> Unit,
    modifier: Modifier = Modifier,
    inSheet: Boolean = false,
    viewModel: CommandsViewModel = hiltViewModel<CommandsViewModel, CommandsViewModel.Factory>(
        key = "commands:$project",
        creationCallback = { it.create(project, session) }
    )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val page = rememberCommandsPage(viewModel.watch)
    var dialog by remember { mutableStateOf<FolderDialog?>(null) }

    CommandsScreen(
        state = state,
        refreshing = page.refreshing,
        onRefresh = page::refresh,
        leading = leading,
        modifier = modifier,
        inSheet = inSheet,
        actions = CommandsActions(
            newCommand = {
                page.editing = CommandEditorKey(project, scope = state.scope, session = session)
            },
            openFolder = { onOpenFolder(state.scope, it.folder) },
            newFolder = { dialog = FolderDialog.Create },
            openOthers = { onOpenOthers(state.scope) },
            renameFolder = { dialog = FolderDialog.Rename(it) },
            deleteFolder = { dialog = FolderDialog.Delete(it) },
            pickScope = viewModel::pick,
            retry = viewModel::retry
        )
    )

    FolderDialogs(
        dialog = dialog,
        onCreate = viewModel::createFolder,
        onRename = viewModel::renameFolder,
        onDelete = viewModel::deleteFolder,
        onDismiss = { dialog = null }
    )
    page.editing?.let { CommandEditorSheet(it, onDismiss = { page.editing = null }) }
    FolderChangeFailed(state.changeError, viewModel::dismissError)
}

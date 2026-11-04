package cx.lpm.mobile.feature.commands.folder

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.EmptyState
import cx.lpm.mobile.core.designsystem.component.ListCard
import cx.lpm.mobile.core.model.CommandScope
import cx.lpm.mobile.core.model.LpmCommand
import cx.lpm.mobile.core.model.OtherSkill
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.folderLabel
import cx.lpm.mobile.core.navigation.CommandEditorKey
import cx.lpm.mobile.core.navigation.CommandFolderKey
import cx.lpm.mobile.core.navigation.OtherSkillKey
import cx.lpm.mobile.feature.commands.R
import cx.lpm.mobile.feature.commands.editor.CommandEditorSheet
import cx.lpm.mobile.feature.commands.list.CommandFolderRow
import cx.lpm.mobile.feature.commands.list.FolderChangeFailed
import cx.lpm.mobile.feature.commands.list.FolderDialog
import cx.lpm.mobile.feature.commands.list.FolderDialogs
import cx.lpm.mobile.feature.commands.list.FolderRowUi
import cx.lpm.mobile.feature.commands.list.NewFolderRow
import cx.lpm.mobile.feature.commands.other.SkillRow
import cx.lpm.mobile.feature.commands.ui.BackButton
import cx.lpm.mobile.feature.commands.ui.CommandsListPadding
import cx.lpm.mobile.feature.commands.ui.CommandsScaffold
import cx.lpm.mobile.feature.commands.ui.rememberCommandsPage

/** A folder pushed over the Commands screen, or over the folder holding it. */
@Composable
fun CommandFolderRoute(
    key: CommandFolderKey,
    onOpenFolder: (CommandFolderKey) -> Unit,
    onOpenOther: (OtherSkillKey) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    CommandFolderHost(
        project = key.project,
        scope = key.scope,
        folder = key.folder,
        session = key.session,
        onOpenFolder = { onOpenFolder(CommandFolderKey(key.project, key.scope, it, key.session)) },
        onOpenOther = { onOpenOther(OtherSkillKey(key.project, key.scope, it, key.session)) },
        modifier = modifier,
        leading = { BackButton(onBack) }
    )
}

/**
 * One folder of one list (No folder when [folder] is null): the folders inside it and
 * its commands. Tapping a command edits it; "+" writes a new one here.
 */
@Composable
internal fun CommandFolderHost(
    project: String,
    scope: CommandScope,
    folder: String?,
    session: SessionKey,
    onOpenFolder: (folder: String) -> Unit,
    onOpenOther: (name: String) -> Unit,
    leading: @Composable RowScope.() -> Unit,
    modifier: Modifier = Modifier,
    inSheet: Boolean = false,
    viewModel: CommandFolderViewModel =
        hiltViewModel<CommandFolderViewModel, CommandFolderViewModel.Factory>(
            key = "commands:$project:${scope.wire}:${folder.orEmpty()}",
            creationCallback = { it.create(project, scope, folder, session) }
        )
) {
    val commands by viewModel.commands.collectAsStateWithLifecycle()
    val others by viewModel.others.collectAsStateWithLifecycle()
    val subfolders by viewModel.subfolders.collectAsStateWithLifecycle()
    val changeError by viewModel.changeError.collectAsStateWithLifecycle()
    val page = rememberCommandsPage(viewModel.watch)
    var dialog by remember { mutableStateOf<FolderDialog?>(null) }
    CommandsScaffold(
        title = folder?.let(::folderLabel) ?: stringResource(R.string.commands_no_folder),
        leading = leading,
        onNewCommand = {
            page.editing =
                CommandEditorKey(project, scope = scope, folder = folder, session = session)
        },
        refreshing = page.refreshing,
        onRefresh = page::refresh,
        modifier = modifier,
        inSheet = inSheet
    ) {
        CommandList(
            FolderSection(subfolders, viewModel.canAddFolder),
            commands,
            others,
            FolderPageActions(
                openFolder = onOpenFolder,
                newFolder = { dialog = FolderDialog.Create },
                renameFolder = { dialog = FolderDialog.Rename(it) },
                deleteFolder = { dialog = FolderDialog.Delete(it) },
                openOther = onOpenOther,
                edit = { page.editing = it.editorKey(project, session) }
            )
        )
        if (commands.isEmpty() && others.isEmpty() && subfolders.isEmpty()) EmptyFolder()
    }
    FolderDialogs(
        dialog = dialog,
        onCreate = viewModel::createFolder,
        onRename = viewModel::renameFolder,
        onDelete = viewModel::deleteFolder,
        onDismiss = { dialog = null }
    )
    FolderChangeFailed(changeError, viewModel::dismissError)
    page.editing?.let { CommandEditorSheet(it, onDismiss = { page.editing = null }) }
}

/** The folders inside this one, and whether "New folder" follows them. */
private class FolderSection(val rows: List<FolderRowUi>, val canAdd: Boolean) {
    val shows: Boolean get() = rows.isNotEmpty() || canAdd
}

/** What a folder page's rows do. */
private class FolderPageActions(
    val openFolder: (String) -> Unit,
    val newFolder: () -> Unit,
    val renameFolder: (String) -> Unit,
    val deleteFolder: (String) -> Unit,
    val openOther: (String) -> Unit,
    val edit: (LpmCommand) -> Unit
)

@Composable
private fun CommandList(
    folders: FolderSection,
    commands: List<LpmCommand>,
    others: List<OtherSkill>,
    actions: FolderPageActions
) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = CommandsListPadding) {
        if (folders.shows) {
            item(key = "folders") { Subfolders(folders, actions) }
        }
        if (commands.isNotEmpty() || others.isNotEmpty()) {
            item(key = "commands") {
                ListCard(if (folders.shows) Modifier.padding(top = 20.dp) else Modifier) {
                    commands.forEach { command ->
                        CommandRow(command, onClick = { actions.edit(command) })
                    }
                    others.forEach { skill ->
                        SkillRow(skill, onClick = { actions.openOther(skill.name) })
                    }
                }
            }
        }
    }
}

@Composable
private fun Subfolders(folders: FolderSection, actions: FolderPageActions) {
    ListCard {
        folders.rows.forEach { row ->
            val folder = row.folder ?: return@forEach
            CommandFolderRow(
                row = row,
                onOpen = { actions.openFolder(folder) },
                onRename = { actions.renameFolder(folder) },
                onDelete = { actions.deleteFolder(folder) }
            )
        }
        if (folders.canAdd) NewFolderRow(actions.newFolder)
    }
}

@Composable
private fun EmptyFolder() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        EmptyState(
            title = stringResource(R.string.commands_empty),
            icon = painterResource(DesignR.drawable.ic_post_add),
            description = stringResource(R.string.commands_empty_description)
        )
    }
}

/** The editor opened on [this] command. */
internal fun LpmCommand.editorKey(project: String, session: SessionKey) = CommandEditorKey(
    project = project,
    original = ref,
    scope = scope,
    folder = folder,
    name = name,
    description = description,
    body = body,
    session = session,
    keepOutOfGit = keptOutOfGit
)

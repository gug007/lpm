package cx.lpm.mobile.feature.commands.folder

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.EmptyState
import cx.lpm.mobile.core.designsystem.component.ListCard
import cx.lpm.mobile.core.model.CommandScope
import cx.lpm.mobile.core.model.LpmCommand
import cx.lpm.mobile.core.model.OtherSkill
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.navigation.CommandEditorKey
import cx.lpm.mobile.core.navigation.CommandFolderKey
import cx.lpm.mobile.core.navigation.OtherSkillKey
import cx.lpm.mobile.feature.commands.R
import cx.lpm.mobile.feature.commands.editor.CommandEditorSheet
import cx.lpm.mobile.feature.commands.other.SkillRow
import cx.lpm.mobile.feature.commands.ui.BackButton
import cx.lpm.mobile.feature.commands.ui.CommandsListPadding
import cx.lpm.mobile.feature.commands.ui.CommandsScaffold
import cx.lpm.mobile.feature.commands.ui.rememberCommandsPage

/** A folder's commands pushed over the Commands screen. */
@Composable
fun CommandFolderRoute(
    key: CommandFolderKey,
    onOpenOther: (OtherSkillKey) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    CommandFolderHost(
        project = key.project,
        scope = key.scope,
        folder = key.folder,
        session = key.session,
        onOpenOther = { onOpenOther(OtherSkillKey(key.project, key.scope, it, key.session)) },
        modifier = modifier,
        leading = { BackButton(onBack) }
    )
}

/**
 * The commands in one folder of one list (No folder when [folder] is null). Tapping
 * one edits it; "+" writes a new one here.
 */
@Composable
internal fun CommandFolderHost(
    project: String,
    scope: CommandScope,
    folder: String?,
    session: SessionKey,
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
    val page = rememberCommandsPage(viewModel.watch)
    CommandsScaffold(
        title = folder ?: stringResource(R.string.commands_no_folder),
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
        CommandList(commands, others, onOpenOther) { page.editing = it.editorKey(project, session) }
        if (commands.isEmpty() && others.isEmpty()) EmptyFolder()
    }
    page.editing?.let { CommandEditorSheet(it, onDismiss = { page.editing = null }) }
}

@Composable
private fun CommandList(
    commands: List<LpmCommand>,
    others: List<OtherSkill>,
    onOpenOther: (String) -> Unit,
    onEdit: (LpmCommand) -> Unit
) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = CommandsListPadding) {
        if (commands.isNotEmpty() || others.isNotEmpty()) {
            item(key = "commands") {
                ListCard {
                    commands.forEach { command ->
                        CommandRow(command, onClick = { onEdit(command) })
                    }
                    others.forEach { skill ->
                        SkillRow(skill, onClick = { onOpenOther(skill.name) })
                    }
                }
            }
        }
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
    session = session
)

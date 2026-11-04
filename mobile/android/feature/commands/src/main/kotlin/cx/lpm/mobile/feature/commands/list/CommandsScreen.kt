package cx.lpm.mobile.feature.commands.list

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.DisclosureChevron
import cx.lpm.mobile.core.designsystem.component.EmptyState
import cx.lpm.mobile.core.designsystem.component.ListCard
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.component.SegmentedControl
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.CommandScope
import cx.lpm.mobile.feature.commands.R
import cx.lpm.mobile.feature.commands.ui.CommandsListPadding
import cx.lpm.mobile.feature.commands.ui.CommandsScaffold
import cx.lpm.mobile.feature.commands.ui.scopeTitle

/** What the Commands screen's rows and bar do. */
@Immutable
class CommandsActions(
    val newCommand: () -> Unit = {},
    val openFolder: (FolderRowUi) -> Unit = {},
    val newFolder: () -> Unit = {},
    val openOthers: () -> Unit = {},
    val renameFolder: (String) -> Unit = {},
    val deleteFolder: (String) -> Unit = {},
    val pickScope: (CommandScope) -> Unit = {},
    val retry: () -> Unit = {}
)

/**
 * The user's lpm commands for one project (iOS `CommandsScreen`): this project's own
 * list and the global one, each split into folders. Tapping a folder lists its
 * commands; "+" writes a new one. [leading] is Back on a pushed screen and Done in a
 * sheet, where [inSheet] drops the status bar inset.
 */
@Composable
fun CommandsScreen(
    state: CommandsUiState,
    refreshing: Boolean,
    onRefresh: () -> Unit,
    leading: @Composable RowScope.() -> Unit,
    modifier: Modifier = Modifier,
    inSheet: Boolean = false,
    actions: CommandsActions = CommandsActions()
) {
    CommandsScaffold(
        title = stringResource(R.string.commands_title),
        leading = leading,
        onNewCommand = actions.newCommand,
        refreshing = refreshing,
        onRefresh = onRefresh,
        modifier = modifier,
        inSheet = inSheet,
        newCommandEnabled = state.loaded
    ) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = CommandsListPadding) {
            // The segments head the folder section, as iOS draws them.
            if (state.scopes.size > 1) {
                item(key = "scopes") { ScopePicker(state, actions.pickScope) }
            }
            if (state.hasList || state.projectError != null) {
                item(key = "folders") { Folders(state, actions) }
            }
            if (state.otherSkills > 0) {
                item(key = "others") {
                    ListCard(Modifier.padding(top = 20.dp)) {
                        OtherSkillsRow(state.otherSkills, actions.openOthers)
                    }
                }
            }
        }
        if (!state.loaded) Overlay(state.loadError, actions.retry)
    }
}

@Composable
private fun ScopePicker(state: CommandsUiState, onPick: (CommandScope) -> Unit) {
    SegmentedControl(
        options = state.scopes.map { scopeTitle(it) },
        selectedIndex = state.scopes.indexOf(state.scope),
        onSelect = { onPick(state.scopes[it]) },
        modifier = Modifier.padding(bottom = 12.dp)
    )
}

/** Why the project's own list couldn't be read, then its folders and "New folder". */
@Composable
private fun Folders(state: CommandsUiState, actions: CommandsActions) {
    ListCard {
        state.projectError?.let { Notice(it) }
        if (state.hasList) {
            state.folders.forEach { row ->
                CommandFolderRow(
                    row = row,
                    onOpen = { actions.openFolder(row) },
                    onRename = { row.folder?.let(actions.renameFolder) },
                    onDelete = { row.folder?.let(actions.deleteFolder) }
                )
            }
            NewFolderRow(actions.newFolder)
        }
    }
}

@Composable
private fun Notice(text: String) {
    ListRow(
        leading = {
            Icon(
                painterResource(DesignR.drawable.ic_warning),
                contentDescription = null,
                tint = LpmTheme.colors.secondaryLabel,
                modifier = Modifier.size(18.dp)
            )
        }
    ) {
        Text(
            text = text,
            style = LpmTheme.typography.footnote,
            color = LpmTheme.colors.secondaryLabel
        )
    }
}

/** The skills not made in lpm in this list, and how many. */
@Composable
private fun OtherSkillsRow(count: Int, onClick: () -> Unit) {
    val colors = LpmTheme.colors
    ListRow(
        onClick = onClick,
        leading = {
            Icon(
                painterResource(DesignR.drawable.ic_folder_limited),
                contentDescription = null,
                tint = colors.tint
            )
        },
        trailing = {
            Text(
                text = count.toString(),
                style = LpmTheme.typography.body.copy(fontFeatureSettings = "tnum"),
                color = colors.secondaryLabel,
                maxLines = 1
            )
            Spacer(Modifier.width(13.dp))
            DisclosureChevron()
        }
    ) {
        Text(
            text = stringResource(R.string.commands_other_skills),
            style = LpmTheme.typography.body
        )
    }
}

/** "New folder", its icon in the folders' column as a `Label` in a List lines up. */
@Composable
private fun NewFolderRow(onClick: () -> Unit) {
    val tint = LpmTheme.colors.tint
    ListRow(
        onClick = onClick,
        leading = {
            Icon(
                painterResource(DesignR.drawable.ic_create_new_folder),
                contentDescription = null,
                tint = tint
            )
        }
    ) {
        Text(
            text = stringResource(R.string.commands_new_folder),
            style = LpmTheme.typography.body,
            color = tint
        )
    }
}

/** A spinner while the lists load, or why they couldn't with "Try Again". */
@Composable
private fun Overlay(error: String?, onRetry: () -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        if (error == null) {
            ActivityIndicator()
        } else {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                EmptyState(
                    title = stringResource(R.string.commands_load_failed),
                    icon = painterResource(DesignR.drawable.ic_warning),
                    description = error,
                    action = stringResource(R.string.try_again),
                    onAction = onRetry
                )
                Spacer(Modifier.height(40.dp))
            }
        }
    }
}

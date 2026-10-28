package cx.lpm.mobile.feature.projects.list

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.data.link.clockStamp
import cx.lpm.mobile.core.data.projects.PendingAgentArchive
import cx.lpm.mobile.core.designsystem.R
import cx.lpm.mobile.core.designsystem.component.EmptyState
import cx.lpm.mobile.core.designsystem.component.HeaderBanner
import cx.lpm.mobile.core.designsystem.component.ListHeaderStyle
import cx.lpm.mobile.core.designsystem.component.ListSection
import cx.lpm.mobile.core.designsystem.component.LpmTopBar
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.ProjectFolder
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.feature.projects.ProjectsSlots
import cx.lpm.mobile.feature.projects.R as ProjectsR
import cx.lpm.mobile.feature.projects.ui.UndoBar
import java.time.Instant

/** What a folder header does: open or shut it, and its long-press menu's rows. */
@Immutable
class FolderActions(
    val toggle: (ProjectFolder, expandedNow: Boolean) -> Unit = { _, _ -> },
    val rename: (ProjectFolder) -> Unit = {},
    val delete: (ProjectFolder) -> Unit = {}
)

/**
 * The projects list (iOS `ProjectsView`): the Mac's name and status over the list,
 * the purple Demo Mode banner, folders and projects as the desktop sidebar arranges
 * them with the Mac's machines at their slots, pull to refresh, the usage rows at the
 * foot, and the duplicate progress HUD over the lpm update bar.
 */
@Composable
fun ProjectsScreen(
    state: ProjectsUiState,
    refreshing: Boolean,
    onRefresh: () -> Unit,
    onExitDemo: () -> Unit,
    modifier: Modifier = Modifier,
    menuActions: ProjectsMenuActions = ProjectsMenuActions(),
    macActions: MacSwitcherActions = MacSwitcherActions(),
    rowActions: ProjectRowActions = ProjectRowActions(),
    folderActions: FolderActions = FolderActions(),
    machineActions: MachineActions = MachineActions(),
    onUndoArchive: () -> Unit = {},
    slots: ProjectsSlots = ProjectsSlots()
) {
    Column(
        modifier
            .fillMaxSize()
            .background(LpmTheme.colors.systemGroupedBackground)
    ) {
        ProjectsHeader(state, menuActions, macActions, onExitDemo)
        if (!state.listIsEmpty) slots.connectionStatusBar(SessionKey.Live)
        Box(
            Modifier
                .weight(1f)
                .fillMaxWidth()
        ) {
            ProjectsList(
                state = state,
                refreshing = refreshing,
                onRefresh = onRefresh,
                actions = ListActions(rowActions, folderActions, machineActions),
                slots = slots
            )
            if (state.listIsEmpty) {
                val issue = state.issue
                when {
                    issue != null -> Box(
                        Modifier
                            .align(Alignment.Center)
                            .padding(horizontal = 20.dp)
                    ) { slots.issueCard(issue) }

                    state.loaded -> EmptyState(
                        title = stringResource(ProjectsR.string.projects_none),
                        icon = painterResource(R.drawable.ic_folder),
                        modifier = Modifier.align(Alignment.Center)
                    )

                    else -> ProjectListSkeleton(Modifier.fillMaxSize())
                }
            }
        }
        UndoBar(message = state.pendingArchive?.let { archivedMessage(it) }, onUndo = onUndoArchive)
        AnimatedVisibility(
            visible = state.duplicateProgress != null,
            enter = slideInVertically { it } + fadeIn(),
            exit = slideOutVertically { it } + fadeOut()
        ) {
            state.duplicateProgress?.let { DuplicateProgressBar(it) }
        }
        Box(Modifier.windowInsetsPadding(WindowInsets.navigationBars)) { slots.bottomBar() }
    }
}

/** "Archived “<tab>”", or how many once several are waiting behind Undo. */
@Composable
private fun archivedMessage(pending: PendingAgentArchive): String {
    val agents = pending.agents
    return if (agents.size == 1) {
        stringResource(ProjectsR.string.agent_archived, agents.single().title)
    } else {
        pluralStringResource(ProjectsR.plurals.agents_archived, agents.size, agents.size)
    }
}

@Composable
private fun ProjectsHeader(
    state: ProjectsUiState,
    menuActions: ProjectsMenuActions,
    macActions: MacSwitcherActions,
    onExitDemo: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier.background(
            if (state.demoMode) LpmTheme.colors.purple else LpmTheme.colors.systemGroupedBackground
        )
    ) {
        LpmTopBar(
            trailing = {
                ProjectsMoreButton(
                    badge = state.badge,
                    automationsUnread = state.automationsUnread,
                    actions = menuActions
                )
            }
        ) {
            MacTitle(
                state = state.title,
                macs = state.macs,
                demoMode = state.demoMode,
                actions = macActions
            )
        }
        if (state.demoMode) {
            Spacer(Modifier.height(10.dp))
            HeaderBanner(
                text = stringResource(ProjectsR.string.demo_banner),
                icon = painterResource(R.drawable.ic_play_circle_fill),
                actionLabel = stringResource(ProjectsR.string.demo_exit),
                onAction = onExitDemo
            )
        }
    }
}

/** Everything the list's rows do. */
@Immutable
private class ListActions(
    val rows: ProjectRowActions,
    val folders: FolderActions,
    val machines: MachineActions
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProjectsList(
    state: ProjectsUiState,
    refreshing: Boolean,
    onRefresh: () -> Unit,
    actions: ListActions,
    slots: ProjectsSlots,
    modifier: Modifier = Modifier
) {
    PullToRefreshBox(
        isRefreshing = refreshing,
        onRefresh = onRefresh,
        modifier = modifier.fillMaxSize()
    ) {
        BoxWithConstraints(Modifier.fillMaxSize()) {
            // The usage rows rest on the bottom edge of a short list and follow a long one.
            Column(
                Modifier
                    .verticalScroll(rememberScrollState())
                    .heightIn(min = maxHeight)
                    .padding(top = ListTopPadding)
            ) {
                if (state.rows.isNotEmpty()) {
                    ListSection(
                        header = state.listAge?.let {
                            stringResource(
                                ProjectsR.string.projects_updated,
                                it.clockStamp(Instant.now())
                            )
                        },
                        headerStyle = ListHeaderStyle.Title,
                        footer = state.listAge?.let {
                            val repair = state.repairFooter
                            if (repair != null) {
                                stringResource(
                                    ProjectsR.string.projects_unpaired_footer,
                                    repair.device,
                                    repair.mac
                                )
                            } else {
                                stringResource(ProjectsR.string.projects_stale_footer)
                            }
                        }
                    ) {
                        ProjectsCardRows(state, actions)
                    }
                }
                if (!state.listIsEmpty) {
                    Spacer(Modifier.weight(1f))
                    slots.usage()
                }
            }
        }
    }
}

@Composable
private fun ProjectsCardRows(state: ProjectsUiState, actions: ListActions) {
    state.rows.forEach { row ->
        key(row.key) {
            when (row) {
                is ProjectsListRow.ProjectEntry -> ProjectListItem(
                    entry = row,
                    folders = state.folders,
                    statusChoices = state.workStatusMenu,
                    actions = actions.rows
                )

                is ProjectsListRow.FolderEntry -> FolderListItem(
                    entry = row,
                    onToggle = { actions.folders.toggle(row.folder, row.expanded) },
                    onRename = { actions.folders.rename(row.folder) },
                    onDelete = { actions.folders.delete(row.folder) }
                )

                is ProjectsListRow.MachineEntry -> MachineListItem(row, actions.machines)

                is ProjectsListRow.MachineProjectEntry -> MachineProjectListItem(
                    row,
                    actions.machines
                )
            }
        }
    }
}

/** From the bar (or the demo banner) to the first card, as iOS lays out the list. */
private val ListTopPadding = 35.4.dp

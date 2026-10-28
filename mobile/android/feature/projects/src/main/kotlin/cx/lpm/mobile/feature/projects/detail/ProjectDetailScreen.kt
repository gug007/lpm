package cx.lpm.mobile.feature.projects.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
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
import cx.lpm.mobile.core.designsystem.R
import cx.lpm.mobile.core.designsystem.component.ButtonRow
import cx.lpm.mobile.core.designsystem.component.GlassIconButton
import cx.lpm.mobile.core.designsystem.component.LinkButton
import cx.lpm.mobile.core.designsystem.component.ListDefaults
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.component.ListSection
import cx.lpm.mobile.core.designsystem.component.ListSectionSpacing
import cx.lpm.mobile.core.designsystem.component.LpmTopBar
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.Service
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.feature.projects.R as ProjectsR
import cx.lpm.mobile.feature.projects.list.QueuedActionLine
import cx.lpm.mobile.feature.projects.ui.UndoBar

/** What the project screen's rows do. */
@Immutable
class ProjectDetailActions(
    val back: () -> Unit = {},
    val openTerminal: (TerminalInfo) -> Unit = {},
    val newTerminal: () -> Unit = {},
    val pin: (TerminalInfo) -> Unit = {},
    val rename: (TerminalInfo) -> Unit = {},
    val close: (TerminalInfo) -> Unit = {},
    val useTitle: (TerminalInfo) -> Unit = {},
    val fork: (TerminalInfo) -> Unit = {},
    val forkCopy: (TerminalInfo) -> Unit = {},
    val closeOthers: (TerminalInfo) -> Unit = {},
    val undoClose: () -> Unit = {},
    val toggleService: (Service) -> Unit = {},
    val restartService: (Service) -> Unit = {},
    val stopService: (Service) -> Unit = {},
    val openLogs: (Service) -> Unit = {},
    val cancelQueued: (String) -> Unit = {},
    val retryQueued: (String) -> Unit = {},
    val stopAll: () -> Unit = {},
    val editConfig: () -> Unit = {},
    val retryConfig: () -> Unit = {}
)

/**
 * A project's screen (iOS `ProjectDetail`): its open tabs with "New tab", its
 * services with their switches and "Stop all", and the sections other features add
 * under them; the "…" menu and ⚡ sit in the bar ([menu]).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProjectDetailScreen(
    state: ProjectDetailUiState,
    refreshing: Boolean,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    actions: ProjectDetailActions = ProjectDetailActions(),
    menu: @Composable RowScope.() -> Unit = {},
    connectionStatusBar: @Composable () -> Unit = {},
    belowServices: @Composable () -> Unit = {},
    usage: @Composable () -> Unit = {}
) {
    Column(
        modifier
            .fillMaxSize()
            .background(LpmTheme.colors.systemGroupedBackground)
    ) {
        LpmTopBar(
            leading = {
                GlassIconButton(
                    icon = painterResource(R.drawable.ic_arrow_back_ios_new),
                    contentDescription = stringResource(ProjectsR.string.back),
                    onClick = actions.back
                )
            },
            trailing = menu,
            keepTitleCentered = true
        ) {
            ProjectTitle(state)
        }
        connectionStatusBar()
        Box(
            Modifier
                .weight(1f)
                .fillMaxWidth()
        ) {
            PullToRefreshBox(
                isRefreshing = refreshing,
                onRefresh = onRefresh,
                modifier = Modifier.fillMaxSize()
            ) {
                BoxWithConstraints(Modifier.fillMaxSize()) {
                    Column(
                        Modifier
                            .verticalScroll(rememberScrollState())
                            .heightIn(min = maxHeight)
                            .padding(top = ListDefaults.ContentTopPadding)
                    ) {
                        QueuedSection(state, actions)
                        TabsSection(state, actions)
                        ServicesSection(state, actions)
                        belowServices()
                        if (state.showsUsage) {
                            Spacer(Modifier.weight(1f))
                            usage()
                        }
                    }
                }
            }
            val configError = state.project?.configError
            if (configError != null) {
                ProjectConfigErrorView(
                    message = configError,
                    onEdit = actions.editConfig,
                    onRetry = actions.retryConfig
                )
            } else if (state.isEmpty) {
                EmptyTerminalsView(
                    onNew = actions.newTerminal,
                    modifier = Modifier.background(LpmTheme.colors.systemGroupedBackground)
                )
            }
            UndoBar(
                message = state.pendingClose?.let {
                    stringResource(ProjectsR.string.tab_closed, it.tab.title)
                },
                onUndo = actions.undoClose,
                modifier = Modifier.align(Alignment.BottomCenter),
                windowInsets = WindowInsets.navigationBars
            )
        }
    }
}

/** Starts, stops and runs waiting for the Mac, one row each. */
@Composable
private fun QueuedSection(state: ProjectDetailUiState, actions: ProjectDetailActions) {
    if (state.queued.isEmpty()) return
    ListSection(spacing = ListSectionSpacing.Compact) {
        state.queued.forEach { action ->
            key(action.id) {
                ListRow {
                    QueuedActionLine(
                        action = action,
                        onCancel = { actions.cancelQueued(action.id) },
                        onRetry = { actions.retryQueued(action.id) }
                    )
                }
            }
        }
    }
}

@Composable
private fun TabsSection(state: ProjectDetailUiState, actions: ProjectDetailActions) {
    val tabs = state.tabs
    if (tabs != null && state.isEmpty) return
    ListSection(
        header = stringResource(ProjectsR.string.detail_tabs),
        spacing = ListSectionSpacing.Compact
    ) {
        if (tabs == null) {
            repeat(SKELETON_ROWS) { TerminalRowSkeleton() }
            return@ListSection
        }
        tabs.forEach { tab ->
            key(tab.terminal.id) {
                TabRow(
                    tab = tab,
                    onOpen = { actions.openTerminal(tab.terminal) },
                    onPin = { actions.pin(tab.terminal) },
                    onRename = { actions.rename(tab.terminal) },
                    onClose = { actions.close(tab.terminal) },
                    extras = tabMenuExtras(state, tabs, tab.terminal, actions)
                )
            }
        }
        if (state.creating) TerminalRowSkeleton()
        ButtonRow(
            text = stringResource(ProjectsR.string.detail_new_tab),
            onClick = actions.newTerminal,
            icon = painterResource(R.drawable.ic_add),
            enabled = !state.creating
        )
    }
}

@Composable
private fun ServicesSection(state: ProjectDetailUiState, actions: ProjectDetailActions) {
    if (state.services.isEmpty()) return
    ListSection(
        header = pluralStringResource(
            ProjectsR.plurals.detail_services,
            state.runningServices,
            state.runningServices,
            state.services.size
        ),
        headerAction = if (state.canStopAll) {
            {
                LinkButton(
                    text = stringResource(ProjectsR.string.detail_stop_all),
                    onClick = actions.stopAll,
                    enabled = !state.stopping
                )
            }
        } else {
            null
        },
        footer = stringResource(ProjectsR.string.detail_services_footer),
        spacing = ListSectionSpacing.Compact
    ) {
        state.services.forEach { entry ->
            key(entry.service.name) {
                ServiceRow(
                    entry = entry,
                    canStop = state.canStopServices,
                    actions = ServiceRowActions(
                        toggle = { actions.toggleService(entry.service) },
                        restart = { actions.restartService(entry.service) },
                        stop = { actions.stopService(entry.service) },
                        open = { actions.openLogs(entry.service) }
                    )
                )
            }
        }
    }
}

/** What the long press offers beyond Pin / Rename / Close, as the desktop's menu would. */
private fun tabMenuExtras(
    state: ProjectDetailUiState,
    tabs: List<TabEntry>,
    term: TerminalInfo,
    actions: ProjectDetailActions
): TabMenuExtras {
    if (!state.canUseTabMenu) return TabMenuExtras()
    val others = tabs.any { it.terminal.id != term.id && !it.terminal.pinned }
    return TabMenuExtras(
        useTitle = { actions.useTitle(term) }.takeIf { term.canTitle },
        fork = { actions.fork(term) }.takeIf { term.canFork },
        forkCopy = { actions.forkCopy(term) }.takeIf { term.canForkCopy },
        closeOthers = { actions.closeOthers(term) }.takeIf { others }
    )
}

private const val SKELETON_ROWS = 3

package cx.lpm.mobile.feature.projects.detail

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleStartEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation3.runtime.NavKey
import cx.lpm.mobile.core.designsystem.component.AlertButton
import cx.lpm.mobile.core.designsystem.component.AlertRole
import cx.lpm.mobile.core.designsystem.component.LocalConfirmRisky
import cx.lpm.mobile.core.designsystem.component.LpmConfirmationDialog
import cx.lpm.mobile.core.designsystem.component.stopProject
import cx.lpm.mobile.core.model.Service
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.core.navigation.ProjectKey
import cx.lpm.mobile.core.navigation.TerminalKey
import cx.lpm.mobile.core.navigation.YamlConfigKey
import cx.lpm.mobile.feature.projects.ProjectsSlots
import cx.lpm.mobile.feature.projects.R
import cx.lpm.mobile.feature.projects.menu.ProjectMenuToolbar
import cx.lpm.mobile.feature.projects.newtab.NewTabSheet
import cx.lpm.mobile.feature.projects.services.ServiceLogsSheet
import cx.lpm.mobile.feature.projects.ui.SessionAlertsHost
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** A project's screen wired to its ViewModel, the menu, navigation and its sheets. */
@Composable
fun ProjectDetailRoute(
    key: ProjectKey,
    onNavigate: (NavKey) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    slots: ProjectsSlots = ProjectsSlots(),
    viewModel: ProjectDetailViewModel =
        hiltViewModel<ProjectDetailViewModel, ProjectDetailViewModel.Factory>(
            creationCallback = { it.create(key) }
        )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val alerts by viewModel.alerts.collectAsStateWithLifecycle()
    var renaming by remember { mutableStateOf<TerminalInfo?>(null) }
    var forkingIntoCopy by remember { mutableStateOf<TerminalInfo?>(null) }
    var closingOthers by remember { mutableStateOf<TerminalInfo?>(null) }
    var logsFor by remember { mutableStateOf<Service?>(null) }
    var newTabOpen by remember { mutableStateOf(false) }
    var refreshing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val confirmRisky = LocalConfirmRisky.current
    val haptics = LocalHapticFeedback.current
    LaunchedEffect(key) { viewModel.load() }
    DisposableEffect(viewModel) {
        viewModel.appear()
        onDispose { viewModel.disappear() }
    }
    var backgrounded by remember { mutableStateOf(false) }
    LifecycleStartEffect(viewModel) {
        if (backgrounded) viewModel.resume()
        onStopOrDispose { backgrounded = true }
    }
    // Back from a dropped link, the tabs are asked for again.
    var wasLive by remember { mutableStateOf(state.live) }
    LaunchedEffect(state.live) {
        if (state.live && !wasLive) viewModel.reloadAfterReconnect()
        wasLive = state.live
    }
    LaunchedEffect(state.canLaunchAgents) {
        if (state.canLaunchAgents) viewModel.loadAgentOptions()
    }
    val openTerminal = { t: TerminalInfo ->
        onNavigate(TerminalKey(key.project, t.id, key.session))
    }
    // A terminal the Mac opened for the phone belongs to the desktop: claim it first.
    val openSpawned = { t: TerminalInfo ->
        viewModel.claimControl(t.id)
        openTerminal(t)
    }

    ProjectDetailScreen(
        state = state,
        refreshing = refreshing,
        onRefresh = {
            scope.launch {
                refreshing = true
                viewModel.load()
                delay(REFRESH_SETTLE_MS)
                refreshing = false
            }
        },
        modifier = modifier,
        actions = ProjectDetailActions(
            back = onBack,
            openTerminal = openTerminal,
            // With agents to offer, New tab asks what the tab starts with; otherwise it
            // opens a shell as it always has.
            newTerminal = {
                if (state.canLaunchAgents) newTabOpen = true else viewModel.newTerminal()
            },
            pin = { viewModel.pin(it.id) },
            rename = { renaming = it },
            // A close takes effect at once; the screen offers Undo for a few seconds.
            close = {
                haptics.performHapticFeedback(HapticFeedbackType.Reject)
                viewModel.close(it.id)
            },
            useTitle = viewModel::useConversationTitle,
            fork = { viewModel.fork(it, openSpawned) },
            forkCopy = { forkingIntoCopy = it },
            closeOthers = { closingOthers = it },
            undoClose = viewModel::undoClose,
            toggleService = { viewModel.toggleService(it.name) },
            restartService = { viewModel.restartService(it.name) },
            stopService = { viewModel.stopService(it.name) },
            openLogs = { logsFor = it },
            cancelQueued = viewModel::cancelQueued,
            retryQueued = viewModel::retryQueued,
            stopAll = {
                confirmRisky.stopProject(key.project) { viewModel.stopAll() }
            },
            editConfig = { onNavigate(YamlConfigKey(key.project, key.session)) },
            retryConfig = { scope.launch { viewModel.refreshProjects() } }
        ),
        menu = {
            ProjectMenuToolbar(
                project = key.project,
                session = key.session,
                onNavigate = onNavigate,
                onSpawnedTerminal = openSpawned,
                slots = slots
            )
        },
        connectionStatusBar = { slots.connectionStatusBar(key.session) },
        belowServices = { slots.backgroundRuns(key.session, key.project) },
        usage = { slots.projectUsage(key.session, key.project) }
    )

    renaming?.let { term ->
        TabRenameAlert(
            term = term,
            onRename = { viewModel.rename(term.id, it) },
            onDismiss = { renaming = null }
        )
    }
    forkingIntoCopy?.let { term ->
        ForkIntoCopyDialog(
            term = term,
            onFork = { viewModel.forkIntoCopy(term) },
            onDismiss = { forkingIntoCopy = null }
        )
    }
    closingOthers?.let { term ->
        CloseOtherTabsDialog(
            count = viewModel.othersClosable(term),
            onClose = {
                haptics.performHapticFeedback(HapticFeedbackType.Reject)
                viewModel.closeOthers(term)
            },
            onDismiss = { closingOthers = null }
        )
    }
    if (newTabOpen) {
        NewTabSheet(
            project = key.project,
            session = key.session,
            onOpen = openSpawned,
            onDismiss = { newTabOpen = false },
            actionInputs = slots.actionInputs
        )
    }
    logsFor?.let { service ->
        ServiceLogsSheet(
            project = key.project,
            service = service,
            session = key.session,
            onDismiss = { logsFor = null }
        )
    }
    SessionAlertsHost(
        alerts = alerts,
        onDismissError = viewModel::dismissError,
        onDismissNotice = viewModel::dismissNotice
    )
}

/** Fork into Copy asks first, as the desktop does. */
@Composable
private fun ForkIntoCopyDialog(term: TerminalInfo, onFork: () -> Unit, onDismiss: () -> Unit) {
    LpmConfirmationDialog(
        title = stringResource(R.string.tab_fork_copy_title),
        message = stringResource(R.string.tab_fork_copy_message, term.title),
        buttons = listOf(
            AlertButton(stringResource(R.string.tab_fork_copy_confirm), onClick = onFork),
            AlertButton(stringResource(R.string.cancel), AlertRole.Cancel)
        ),
        onDismissRequest = onDismiss
    )
}

/** Close Other Tabs asks first: whatever runs in them stops. */
@Composable
private fun CloseOtherTabsDialog(count: Int, onClose: () -> Unit, onDismiss: () -> Unit) {
    LpmConfirmationDialog(
        title = pluralStringResource(R.plurals.tab_close_others_title, count, count),
        message = stringResource(R.string.tab_close_others_message),
        buttons = listOf(
            AlertButton(
                pluralStringResource(R.plurals.tab_close_others_confirm, count, count),
                AlertRole.Destructive,
                onClick = onClose
            ),
            AlertButton(stringResource(R.string.cancel), AlertRole.Cancel)
        ),
        onDismissRequest = onDismiss
    )
}

private const val REFRESH_SETTLE_MS = 500L

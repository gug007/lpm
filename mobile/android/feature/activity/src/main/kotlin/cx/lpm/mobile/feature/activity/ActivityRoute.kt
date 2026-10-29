package cx.lpm.mobile.feature.activity

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.navigation3.runtime.NavKey
import cx.lpm.mobile.core.designsystem.component.AlertButton
import cx.lpm.mobile.core.designsystem.component.AlertRole
import cx.lpm.mobile.core.designsystem.component.LocalConfirmRisky
import cx.lpm.mobile.core.designsystem.component.LpmAlert
import cx.lpm.mobile.core.designsystem.component.stopProject
import cx.lpm.mobile.core.navigation.AutomationKey
import cx.lpm.mobile.core.navigation.ProjectKey
import cx.lpm.mobile.core.navigation.TerminalKey
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Activity wired to its ViewModel, the clock its elapsed labels read, and navigation. */
@Composable
fun ActivityRoute(
    onNavigate: (NavKey) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    connectionStatusBar: @Composable () -> Unit = {},
    viewModel: ActivityViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var query by rememberSaveable { mutableStateOf("") }
    var searching by rememberSaveable { mutableStateOf(false) }
    var kind by rememberSaveable { mutableStateOf(ActivityKindFilter.All) }
    var refreshing by rememberSaveable { mutableStateOf(false) }
    // The reason a row refused to be cleared, shown once the user asks why.
    var blockedReason by rememberSaveable { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    val confirmRisky = LocalConfirmRisky.current

    LaunchedEffect(Unit) {
        viewModel.leaveVisit()
        viewModel.load()
    }

    ActivityScreen(
        state = state,
        query = query,
        searching = searching,
        kind = kind,
        now = tickingNow(),
        refreshing = refreshing,
        modifier = modifier,
        connectionStatusBar = connectionStatusBar,
        actions = ActivityActions(
            back = onBack,
            search = { query = it },
            beginSearch = { searching = true },
            endSearch = {
                query = ""
                searching = false
            },
            pickKind = { kind = it },
            toggleGrouped = viewModel::toggleGrouped,
            refresh = {
                scope.launch {
                    refreshing = true
                    viewModel.refresh()
                    refreshing = false
                }
            },
            list = ActivityListActions(
                open = { row ->
                    (activityDestination(row) ?: viewModel.visit(row))?.let(onNavigate)
                },
                dismiss = { row ->
                    haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
                    viewModel.dismiss(row)
                },
                explain = { blockedReason = it },
                runChip = { project, chip ->
                    // A lit profile is the only thing running, so turning it off stops the project.
                    if (chip.kind == ActivityChip.Kind.Profile && chip.running) {
                        confirmRisky.stopProject(project) { viewModel.runChip(project, chip) }
                    } else {
                        viewModel.runChip(project, chip)
                    }
                },
                stop = { project -> confirmRisky.stopProject(project) { viewModel.stop(project) } },
                openProject = { onNavigate(ProjectKey(it)) }
            )
        )
    )

    blockedReason?.let { reason ->
        LpmAlert(
            title = stringResource(R.string.activity_blocked_title),
            message = reason,
            buttons = listOf(AlertButton(stringResource(R.string.activity_ok), AlertRole.Cancel)),
            onDismissRequest = { blockedReason = null }
        )
    }
}

/**
 * Unix millis, ticked once a second so the elapsed labels stay live — only while
 * someone can read them: not behind a pushed screen, nor with the app in the background.
 */
@Composable
private fun tickingNow(): Long {
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val now by produceState(System.currentTimeMillis(), lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            while (true) {
                value = System.currentTimeMillis()
                delay(TICK_MS)
            }
        }
    }
    return now
}

/**
 * Where a tapped row goes: the automation's page, an agent's
 * terminal, or its project when it reports against no terminal. A row on one of the
 * Mac's other machines opens there, in a visit ([ActivityViewModel.visit]).
 */
fun activityDestination(row: ActivityRow): NavKey? = when (row.kind) {
    ActivityRowKind.Automation -> row.jobId?.let {
        AutomationKey(project = row.jobProject.orEmpty(), jobId = it)
    }

    ActivityRowKind.Agent -> {
        val project = row.project.name
        val terminal = row.terminalId
        when {
            project.isEmpty() || row.project.machine != null -> null
            terminal != null -> TerminalKey(project, terminal)
            else -> ProjectKey(project)
        }
    }
}

private const val TICK_MS = 1_000L

package cx.lpm.mobile.feature.automations.detail

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation3.runtime.NavKey
import cx.lpm.mobile.core.navigation.AutomationKey
import cx.lpm.mobile.core.navigation.AutomationRunKey
import cx.lpm.mobile.feature.automations.editor.AutomationEditorSheet
import cx.lpm.mobile.feature.automations.editor.AutomationEditorTarget
import cx.lpm.mobile.feature.automations.ui.LiveOutputPolling
import cx.lpm.mobile.feature.automations.ui.UpdateFailedAlert
import kotlinx.coroutines.launch

/** An automation's page wired to its ViewModel, the editor sheet and navigation. */
@Composable
fun AutomationDetailRoute(
    key: AutomationKey,
    onNavigate: (NavKey) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: AutomationDetailViewModel =
        hiltViewModel<AutomationDetailViewModel, AutomationDetailViewModel.Factory>(
            creationCallback = { it.create(key) }
        )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var editor by remember { mutableStateOf<AutomationEditorTarget?>(null) }
    var refreshing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    LaunchedEffect(key) { viewModel.load() }
    LiveOutputPolling(running = state.job?.running == true, poll = viewModel::loadLiveOutput)

    AutomationDetailScreen(
        state = state,
        refreshing = refreshing,
        onRefresh = {
            scope.launch {
                refreshing = true
                viewModel.refresh()
                refreshing = false
            }
        },
        modifier = modifier,
        actions = AutomationDetailActions(
            back = onBack,
            edit = { state.job?.let { editor = AutomationEditorTarget.Edit(it) } },
            setEnabled = {
                haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
                viewModel.setEnabled(it)
            },
            toggleSchedule = { viewModel.setScheduleOpen(!state.scheduleOpen) },
            toggleSetup = { viewModel.setSetupOpen(!state.setupOpen) },
            markRead = viewModel::markRead,
            openRun = { onNavigate(AutomationRunKey(key.project, key.jobId, it, key.session)) },
            runBar = {
                haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
                viewModel.runBarTapped()
            },
            takeOver = viewModel::takeOver,
            answer = viewModel::answer,
            dismissQuestion = viewModel::dismissQuestion
        )
    )

    editor?.let { target ->
        AutomationEditorSheet(target = target, session = key.session, onDismiss = { editor = null })
    }
    state.error?.let { UpdateFailedAlert(it, viewModel::dismissError) }
}

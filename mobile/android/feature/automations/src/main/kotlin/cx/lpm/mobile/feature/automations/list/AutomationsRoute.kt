package cx.lpm.mobile.feature.automations.list

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
import cx.lpm.mobile.core.navigation.AutomationsKey
import cx.lpm.mobile.feature.automations.editor.AutomationEditorSheet
import cx.lpm.mobile.feature.automations.editor.AutomationEditorTarget
import cx.lpm.mobile.feature.automations.ui.UpdateFailedAlert
import kotlinx.coroutines.launch

/** The automations list wired to its ViewModel, the editor sheet and navigation. */
@Composable
fun AutomationsRoute(
    key: AutomationsKey,
    onNavigate: (NavKey) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: AutomationsViewModel =
        hiltViewModel<AutomationsViewModel, AutomationsViewModel.Factory>(
            creationCallback = { it.create(key) }
        )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var editor by remember { mutableStateOf<AutomationEditorTarget?>(null) }
    var refreshing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    LaunchedEffect(key) { viewModel.load() }

    AutomationsScreen(
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
        actions = AutomationsActions(
            back = onBack,
            open = { job ->
                // In a project's page a shared job opens on this project's runs.
                onNavigate(AutomationKey(key.project ?: job.runProject, job.id, key.session))
            },
            create = { editor = AutomationEditorTarget.Create(key.project) },
            edit = { editor = AutomationEditorTarget.Edit(it) },
            markAllRead = {
                haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
                viewModel.markAllRead()
            },
            markRead = viewModel::markRead,
            toggleFailedOnly = {
                haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
                viewModel.toggleFailedOnly()
            },
            toggleEnabled = viewModel::toggleEnabled,
            run = viewModel::run,
            stop = viewModel::stop
        )
    )

    editor?.let { target ->
        AutomationEditorSheet(target = target, session = key.session, onDismiss = { editor = null })
    }
    state.error?.let { UpdateFailedAlert(it, viewModel::dismissError) }
}

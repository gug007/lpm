package cx.lpm.mobile.feature.projects.ci

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.feature.projects.ActionRunStepHost
import cx.lpm.mobile.feature.projects.newtab.ActionInputsSlot

/**
 * The CI sheet's Fix with … rows on another feature's screen (the commit sheet's hook
 * panel): each pick opens a new tab whose agent's first prompt is [prompt]'s, after
 * its action's inputs and confirmation ([actionInputs]). [onStart] runs as the tab is
 * asked for; [onSpawnedTerminal] gets it once it's open.
 */
@Composable
fun AgentFixRows(
    session: SessionKey,
    project: String,
    @StringRes detail: Int,
    prompt: () -> String?,
    onStart: () -> Unit,
    onSpawnedTerminal: (TerminalInfo) -> Unit,
    actionInputs: ActionInputsSlot,
    viewModel: AgentFixViewModel = hiltViewModel<AgentFixViewModel, AgentFixViewModel.Factory>(
        key = "agent-fix:$session:$project",
        creationCallback = { it.create(project, session) }
    )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val haptics = LocalHapticFeedback.current
    val started = {
        haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
        onStart()
    }
    LaunchedEffect(viewModel) { viewModel.loadAgents() }
    CiFixRows(state.tabs, detail = detail, onFix = { option ->
        val text = prompt() ?: return@CiFixRows
        if (viewModel.fix(option, text, onSpawnedTerminal)) started()
    })
    ActionRunStepHost(
        state.step,
        actionInputs,
        onSubmit = { values -> if (viewModel.submitInputs(values, onSpawnedTerminal)) started() },
        onConfirm = {
            viewModel.confirm(onSpawnedTerminal)
            started()
        },
        onDismiss = viewModel::dismissStep
    )
}

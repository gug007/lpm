package cx.lpm.mobile.feature.actions.run

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.component.AlertButton
import cx.lpm.mobile.core.designsystem.component.AlertRole
import cx.lpm.mobile.core.designsystem.component.LpmAlert
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.feature.actions.R
import cx.lpm.mobile.feature.actions.popup.ActionAppSheet

/**
 * Runs the actions picked from a project's ⚡ sheet, on the screen under it: the
 * inputs sheet, the "Run …?" confirmation, a background run's live output, and the
 * app an action opens in place of a run.
 * [onSpawnedTerminal] opens a terminal a terminal action starts on the Mac.
 */
@Composable
fun ActionRunHost(
    project: String,
    session: SessionKey,
    onSpawnedTerminal: (TerminalInfo) -> Unit,
    viewModel: ActionRunViewModel =
        hiltViewModel<ActionRunViewModel, ActionRunViewModel.Factory>(
            key = "action-run:$session:$project",
            creationCallback = { it.create(project, session) }
        )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val spawned by rememberUpdatedState(onSpawnedTerminal)
    val onSpawn: (TerminalInfo) -> Unit = remember { { spawned(it) } }
    LaunchedEffect(state.picked) {
        if (state.picked) viewModel.runPicked(onSpawn)
    }
    when (val step = state.step) {
        is RunStep.Inputs -> ActionInputsSheet(
            action = step.action,
            onSubmit = { viewModel.submitInputs(it, onSpawn) },
            onDismiss = { viewModel.dismiss(step) }
        )

        is RunStep.Confirm -> LpmAlert(
            title = stringResource(R.string.actions_run_confirm, step.action.label),
            buttons = listOf(
                AlertButton(stringResource(R.string.actions_run)) { viewModel.confirm(onSpawn) },
                AlertButton(stringResource(R.string.cancel), AlertRole.Cancel)
            ),
            onDismissRequest = { viewModel.dismiss(step) }
        )

        is RunStep.App -> ActionAppSheet(
            project = project,
            action = step.action,
            session = session,
            onDismiss = { viewModel.dismiss(step) }
        )

        is RunStep.Background -> BackgroundRunSheet(
            project = project,
            runId = step.runId,
            label = step.label,
            session = session,
            onDismiss = { viewModel.dismiss(step) }
        )

        null -> Unit
    }
}

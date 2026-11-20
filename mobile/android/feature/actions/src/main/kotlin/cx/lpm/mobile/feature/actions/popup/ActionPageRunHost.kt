package cx.lpm.mobile.feature.actions.popup

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import cx.lpm.mobile.core.designsystem.component.AlertButton
import cx.lpm.mobile.core.designsystem.component.AlertRole
import cx.lpm.mobile.core.designsystem.component.LpmAlert
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.feature.actions.R
import cx.lpm.mobile.feature.actions.run.ActionInputsSheet
import cx.lpm.mobile.feature.actions.run.BackgroundRunSheet

/**
 * What a page's run shows over its sheet (iOS `ActionPageRunHost`): the inputs sheet,
 * the "Run …?" confirmation, a background run's live output, and an app it opens.
 */
@Composable
internal fun ActionPageRunHost(
    step: PageRunStep?,
    project: String,
    session: SessionKey,
    onSubmitInputs: (Map<String, String>) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: (PageRunStep) -> Unit,
    onSpawnedTerminal: ((TerminalInfo) -> Unit)?
) {
    when (step) {
        is PageRunStep.Inputs -> ActionInputsSheet(
            action = step.action,
            onSubmit = onSubmitInputs,
            onDismiss = { onDismiss(step) },
            initial = step.initial
        )

        is PageRunStep.Confirm -> LpmAlert(
            title = stringResource(R.string.actions_run_confirm, step.action.label),
            buttons = listOf(
                AlertButton(stringResource(R.string.actions_run), onClick = onConfirm),
                AlertButton(stringResource(R.string.cancel), AlertRole.Cancel)
            ),
            onDismissRequest = { onDismiss(step) }
        )

        is PageRunStep.Background -> BackgroundRunSheet(
            project = project,
            runId = step.runId,
            label = step.label,
            session = session,
            onDismiss = { onDismiss(step) }
        )

        is PageRunStep.App -> ActionAppSheet(
            project = project,
            action = step.action,
            session = session,
            onDismiss = { onDismiss(step) },
            onSpawnedTerminal = onSpawnedTerminal
        )

        null -> Unit
    }
}

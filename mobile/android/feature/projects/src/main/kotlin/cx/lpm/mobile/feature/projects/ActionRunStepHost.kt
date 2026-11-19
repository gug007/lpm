package cx.lpm.mobile.feature.projects

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import cx.lpm.mobile.core.designsystem.component.AlertButton
import cx.lpm.mobile.core.designsystem.component.AlertRole
import cx.lpm.mobile.core.designsystem.component.LpmAlert
import cx.lpm.mobile.feature.projects.newtab.ActionInputsSlot

/** The picked action's inputs, then its confirmation, while [step] says one is up. */
@Composable
internal fun ActionRunStepHost(
    step: ActionRunStep?,
    actionInputs: ActionInputsSlot,
    onSubmit: (Map<String, String>) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: (ActionRunStep) -> Unit
) {
    when (step) {
        is ActionRunStep.Inputs -> actionInputs(step.action, onSubmit) { onDismiss(step) }

        is ActionRunStep.Confirm -> LpmAlert(
            title = stringResource(R.string.new_tab_run_confirm, step.action.label),
            buttons = listOf(
                AlertButton(stringResource(R.string.new_tab_run), onClick = onConfirm),
                AlertButton(stringResource(R.string.cancel), AlertRole.Cancel)
            ),
            onDismissRequest = { onDismiss(step) }
        )

        null -> Unit
    }
}

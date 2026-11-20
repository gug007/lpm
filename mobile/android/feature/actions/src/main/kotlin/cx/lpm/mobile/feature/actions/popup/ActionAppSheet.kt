package cx.lpm.mobile.feature.actions.popup

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.component.ModalSheet
import cx.lpm.mobile.core.designsystem.component.rememberModalSheetState
import cx.lpm.mobile.core.model.Action
import cx.lpm.mobile.core.model.ActionPageView
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.navigation.PresentationScope

/**
 * An action's app (iOS `ActionAppScreen`), opened by a tap on its button in place of
 * running a command: the page the Mac made filling a full-height sheet under a bar with
 * its title, how old its data is, Refresh and Done. It asks again every `refresh`
 * seconds while it's open.
 */
@Composable
fun ActionAppSheet(
    project: String,
    action: Action,
    session: SessionKey,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier
) {
    PresentationScope { ActionAppSheetContent(project, action, session, onDismiss, modifier) }
}

@Composable
private fun ActionAppSheetContent(
    project: String,
    action: Action,
    session: SessionKey,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: ActionPopupViewModel =
        hiltViewModel<ActionPopupViewModel, ActionPopupViewModel.Factory>(
            key = "app:$session:$project:${action.name}",
            creationCallback = { it.create(project, action, session, ActionPageView.Tab) }
        )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val sheet = rememberModalSheetState()
    RefreshTicker(state.popup.content?.refresh ?: 0, viewModel::tick)
    ModalSheet(onDismissRequest = onDismiss, modifier = modifier, state = sheet) {
        ActionPopupScreen(
            state = state,
            project = project,
            action = action.name,
            onRefresh = viewModel::reload,
            onDone = { sheet.dismiss(onDismiss) },
            onPageFail = viewModel::pageFailed,
            view = ActionPageView.Tab
        )
    }
}

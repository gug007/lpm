package cx.lpm.mobile.feature.actions.sheet

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.model.Action
import cx.lpm.mobile.core.navigation.ProjectActionsKey
import cx.lpm.mobile.feature.actions.button.ActionCallbacks
import cx.lpm.mobile.feature.actions.editor.ActionEditorSheet
import cx.lpm.mobile.feature.actions.popup.ActionPopupSheet

/**
 * The ⚡ sheet wired to its ViewModel. A picked action closes the sheet and is handed
 * to the screen under it once the sheet is gone, since running it may present a
 * sheet of its own.
 */
@Composable
fun ProjectActionsRoute(
    key: ProjectActionsKey,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: ProjectActionsViewModel =
        hiltViewModel<ProjectActionsViewModel, ProjectActionsViewModel.Factory>(
            creationCallback = { it.create(key) }
        )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var chosen by remember { mutableStateOf<Action?>(null) }
    var editorOpen by rememberSaveable { mutableStateOf(false) }
    var editingKey by rememberSaveable { mutableStateOf<String?>(null) }
    var popup by remember { mutableStateOf<Action?>(null) }
    DisposableEffect(viewModel) { onDispose { chosen?.let(viewModel::pick) } }
    ProjectActionsSheet(
        state = state,
        callbacks = ActionCallbacks(
            run = {
                if (chosen == null) {
                    chosen = it
                    onDismiss()
                }
            },
            edit = {
                editingKey = it.name
                editorOpen = true
            },
            popup = if (state.popups) {
                { popup = it }
            } else {
                null
            },
            lastUsed = { group -> state.memory.lastUsed(key.project, group) },
            remember = viewModel::rememberChild
        ),
        onShowLayer = viewModel::showLayer,
        onNew = {
            editingKey = null
            editorOpen = true
        },
        modifier = modifier
    )
    popup?.let { action ->
        ActionPopupSheet(
            project = key.project,
            action = action,
            session = key.session,
            onDismiss = { popup = null }
        )
    }
    if (editorOpen) {
        ActionEditorSheet(
            project = key.project,
            editingKey = editingKey,
            session = key.session,
            onDismiss = { editorOpen = false }
        )
    }
}

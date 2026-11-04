package cx.lpm.mobile.feature.commands.editor

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.component.AlertButton
import cx.lpm.mobile.core.designsystem.component.AlertRole
import cx.lpm.mobile.core.designsystem.component.LpmAlert
import cx.lpm.mobile.core.designsystem.component.ModalSheet
import cx.lpm.mobile.core.designsystem.component.rememberModalSheetState
import cx.lpm.mobile.core.navigation.CommandEditorKey
import cx.lpm.mobile.core.navigation.InteractiveDismissDisabled
import cx.lpm.mobile.core.navigation.PresentationScope
import cx.lpm.mobile.core.ui.EditorTopBar
import cx.lpm.mobile.core.ui.HapticEffect
import cx.lpm.mobile.feature.commands.R
import cx.lpm.mobile.feature.commands.ui.WatchCommands

/** The command editor in a sheet over the screen that opened it. */
@Composable
fun CommandEditorSheet(
    key: CommandEditorKey,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier
) {
    PresentationScope {
        val sheet = rememberModalSheetState()
        var saving by remember { mutableStateOf(false) }
        ModalSheet(
            onDismissRequest = onDismiss,
            modifier = modifier,
            state = sheet,
            dismissible = !saving
        ) {
            CommandEditor(
                key = key,
                onClose = { sheet.dismiss(onDismiss) },
                onSaving = { saving = it }
            )
        }
    }
}

/** The editor as a sheet destination, from the composer's "Save as command". */
@Composable
fun CommandEditorRoute(
    key: CommandEditorKey,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier
) {
    var saving by remember { mutableStateOf(false) }
    InteractiveDismissDisabled(saving)
    CommandEditor(key, onClose = onDismiss, onSaving = { saving = it }, modifier = modifier)
}

@Composable
private fun CommandEditor(
    key: CommandEditorKey,
    onClose: () -> Unit,
    onSaving: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: CommandEditorViewModel =
        hiltViewModel<CommandEditorViewModel, CommandEditorViewModel.Factory>(
            creationCallback = { it.create(key) }
        )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var confirmingDelete by rememberSaveable { mutableStateOf(false) }
    val close by rememberUpdatedState(onClose)
    val reportSaving by rememberUpdatedState(onSaving)
    WatchCommands(viewModel.watch)
    LaunchedEffect(state.saving) { reportSaving(state.saving) }
    LaunchedEffect(state.done) { if (state.done) close() }
    HapticEffect(state.feedback)

    Column(modifier.fillMaxSize()) {
        EditorTopBar(
            title = stringResource(
                if (state.isNew) {
                    R.string.command_editor_new_title
                } else {
                    R.string.command_editor_edit_title
                }
            ),
            onCancel = onClose,
            confirmLabel = stringResource(R.string.command_editor_save),
            onConfirm = viewModel::save,
            confirmEnabled = state.canSave,
            busy = state.saving
        )
        CommandEditorForm(
            state = state,
            actions = EditorActions(
                setName = viewModel::setName,
                setKeepOutOfGit = viewModel::setKeepOutOfGit,
                setDescription = viewModel::setDescription,
                setBody = viewModel::setBody,
                place = viewModel::place,
                convert = viewModel::convert.takeIf { viewModel.canConvert },
                delete = { confirmingDelete = true }
            )
        )
    }
    if (confirmingDelete) {
        LpmAlert(
            title = stringResource(
                R.string.command_editor_delete_title,
                state.draft.original?.name.orEmpty()
            ),
            message = stringResource(R.string.command_editor_delete_message),
            buttons = listOf(
                AlertButton(stringResource(R.string.delete), AlertRole.Destructive) {
                    viewModel.delete()
                },
                AlertButton(stringResource(R.string.cancel), AlertRole.Cancel)
            ),
            onDismissRequest = { confirmingDelete = false }
        )
    }
}

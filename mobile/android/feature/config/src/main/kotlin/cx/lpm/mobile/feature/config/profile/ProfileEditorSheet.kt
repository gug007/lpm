package cx.lpm.mobile.feature.config.profile

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.component.AlertButton
import cx.lpm.mobile.core.designsystem.component.AlertRole
import cx.lpm.mobile.core.designsystem.component.LpmAlert
import cx.lpm.mobile.core.designsystem.component.LpmConfirmationDialog
import cx.lpm.mobile.core.designsystem.component.ModalSheet
import cx.lpm.mobile.core.designsystem.component.rememberModalSheetState
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.navigation.PresentationScope
import cx.lpm.mobile.core.ui.EditorTopBar
import cx.lpm.mobile.feature.config.R
import cx.lpm.mobile.feature.config.ui.HeaderlessTopPadding

/**
 * Create or edit one of a project's profiles ([editingName] null creates one), a sheet
 * over the configuration sheet; it goes once the Mac has written the change.
 */
@Composable
fun ProfileEditorSheet(
    project: String,
    editingName: String?,
    session: SessionKey,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier
) {
    PresentationScope { ProfileEditorContent(project, editingName, session, onDismiss, modifier) }
}

@Composable
private fun ProfileEditorContent(
    project: String,
    editingName: String?,
    session: SessionKey,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: ProfileEditorViewModel =
        hiltViewModel<ProfileEditorViewModel, ProfileEditorViewModel.Factory>(
            creationCallback = { it.create(project, editingName, session) }
        )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var confirmDelete by remember { mutableStateOf(false) }
    val sheet = rememberModalSheetState()
    val haptics = LocalHapticFeedback.current
    val dismiss by rememberUpdatedState(onDismiss)
    LaunchedEffect(state.done) {
        if (state.done) {
            haptics.performHapticFeedback(HapticFeedbackType.Confirm)
            sheet.dismiss(dismiss)
        }
    }
    ModalSheet(
        onDismissRequest = onDismiss,
        modifier = modifier,
        state = sheet,
        dismissible = !state.saving
    ) {
        EditorTopBar(
            title = stringResource(
                if (state.editing) R.string.config_profile_edit else R.string.config_add_profile
            ),
            onCancel = { sheet.dismiss(onDismiss) },
            confirmLabel = stringResource(R.string.save),
            onConfirm = {
                haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
                viewModel.save()
            },
            confirmEnabled = state.canSave,
            busy = state.saving
        )
        Column(
            Modifier
                .fillMaxWidth()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(top = HeaderlessTopPadding)
        ) {
            ProfileForm(
                state = state,
                onNameChange = viewModel::editName,
                onToggle = viewModel::toggle,
                onDelete = {
                    haptics.performHapticFeedback(HapticFeedbackType.Reject)
                    confirmDelete = true
                }
            )
        }
    }
    state.mutationError?.let { error ->
        LpmAlert(
            title = stringResource(R.string.config_profile_save_failed),
            message = error,
            buttons = listOf(AlertButton(stringResource(R.string.ok), AlertRole.Cancel)),
            onDismissRequest = { viewModel.dismissMutationError() }
        )
    }
    if (confirmDelete) {
        LpmConfirmationDialog(
            title = stringResource(R.string.config_profile_delete_title),
            message = stringResource(R.string.config_profile_delete_message),
            buttons = listOf(
                AlertButton(
                    stringResource(R.string.delete),
                    AlertRole.Destructive,
                    onClick = viewModel::delete
                ),
                AlertButton(stringResource(R.string.cancel), AlertRole.Cancel)
            ),
            onDismissRequest = { confirmDelete = false }
        )
    }
}

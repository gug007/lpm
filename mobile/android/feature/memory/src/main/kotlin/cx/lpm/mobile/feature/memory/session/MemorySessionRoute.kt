package cx.lpm.mobile.feature.memory.session

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.statusBars
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
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
import cx.lpm.mobile.core.designsystem.component.LpmConfirmationDialog
import cx.lpm.mobile.core.navigation.MemorySessionKey
import cx.lpm.mobile.core.ui.HapticEffect
import cx.lpm.mobile.feature.memory.R
import cx.lpm.mobile.feature.memory.editor.MemoryEditorSheet
import kotlinx.coroutines.launch

/**
 * One session's page wired to its ViewModel, the editor and the delete prompts. It
 * closes itself once the session is deleted. [windowInsets] are the bar's: none inside
 * the composer's sheet.
 */
@Composable
fun MemorySessionRoute(
    key: MemorySessionKey,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    windowInsets: WindowInsets = WindowInsets.statusBars,
    viewModel: MemorySessionViewModel =
        hiltViewModel<MemorySessionViewModel, MemorySessionViewModel.Factory>(
            creationCallback = { it.create(key) }
        )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var editing by rememberSaveable { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var refreshing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val back by rememberUpdatedState(onBack)
    DisposableEffect(viewModel) {
        viewModel.open()
        onDispose { viewModel.close() }
    }
    LaunchedEffect(state.deleted) { if (state.deleted) back() }
    HapticEffect(state.feedback)

    MemorySessionScreen(
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
        editing = editing,
        windowInsets = windowInsets,
        actions = MemorySessionActions(
            back = onBack,
            edit = { editing = true },
            delete = { confirmDelete = true },
            retry = viewModel::retry,
            dismissConflict = viewModel::dismissConflict
        )
    )

    if (editing) {
        MemoryEditorSheet(key = key, title = state.title, onDismiss = { editing = false })
    }
    if (confirmDelete) {
        LpmConfirmationDialog(
            title = stringResource(R.string.memory_delete_title),
            message = stringResource(R.string.memory_delete_message, state.title),
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
    state.deleteError?.let { error ->
        LpmAlert(
            title = stringResource(R.string.memory_delete_failed),
            message = error,
            buttons = listOf(AlertButton(stringResource(R.string.ok), AlertRole.Cancel)),
            onDismissRequest = viewModel::dismissDeleteError
        )
    }
}

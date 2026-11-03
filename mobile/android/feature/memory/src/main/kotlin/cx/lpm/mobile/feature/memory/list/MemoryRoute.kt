package cx.lpm.mobile.feature.memory.list

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation3.runtime.NavKey
import cx.lpm.mobile.core.designsystem.component.AlertButton
import cx.lpm.mobile.core.designsystem.component.AlertRole
import cx.lpm.mobile.core.designsystem.component.LpmAlert
import cx.lpm.mobile.core.designsystem.component.LpmConfirmationDialog
import cx.lpm.mobile.core.navigation.MemoryKey
import cx.lpm.mobile.core.navigation.MemorySessionKey
import cx.lpm.mobile.core.ui.HapticEffect
import cx.lpm.mobile.feature.memory.R
import cx.lpm.mobile.feature.memory.create.MemoryCreateSheet
import kotlinx.coroutines.launch

/** The session memory list wired to its ViewModel, the create sheet and navigation. */
@Composable
fun MemoryRoute(
    key: MemoryKey,
    onNavigate: (NavKey) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: MemoryViewModel = hiltViewModel<MemoryViewModel, MemoryViewModel.Factory>(
        creationCallback = { it.create(key) }
    )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var creating by rememberSaveable { mutableStateOf(false) }
    var pendingDelete by remember { mutableStateOf<MemoryRowUi?>(null) }
    var refreshing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    DisposableEffect(viewModel) {
        viewModel.open()
        onDispose { viewModel.close() }
    }
    HapticEffect(state.feedback)

    fun open(name: String, title: String) =
        onNavigate(MemorySessionKey(key.project, name, title, key.session))

    MemoryScreen(
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
        actions = MemoryActions(
            back = onBack,
            create = { creating = true },
            open = { open(it.name, it.title) },
            delete = { pendingDelete = it },
            retry = viewModel::retry
        )
    )

    if (creating) {
        MemoryCreateSheet(
            project = key.project,
            ownerLabel = state.ownerLabel,
            session = key.session,
            onOpen = { slug ->
                creating = false
                open(slug, state.titleOf(slug))
            },
            onDismiss = { creating = false }
        )
    }
    pendingDelete?.let { row ->
        LpmConfirmationDialog(
            title = stringResource(R.string.memory_delete_title),
            message = stringResource(R.string.memory_delete_message, row.title),
            buttons = listOf(
                AlertButton(stringResource(R.string.delete), AlertRole.Destructive) {
                    viewModel.delete(row.name)
                },
                AlertButton(stringResource(R.string.cancel), AlertRole.Cancel)
            ),
            onDismissRequest = { pendingDelete = null }
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

package cx.lpm.mobile.feature.terminal.history

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ActivityIndicatorSize
import cx.lpm.mobile.core.designsystem.component.ModalSheet
import cx.lpm.mobile.core.designsystem.component.SearchField
import cx.lpm.mobile.core.designsystem.component.rememberModalSheetState
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.HistoryItem
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.feature.terminal.R
import cx.lpm.mobile.feature.terminal.composer.SheetHeader

/**
 * The message history (present it in a `PresentationScope`, so each opening starts
 * afresh): sent prompts and saved drafts, searchable, with favorites
 * and folders. A row loads into the composer; "Send now" sends it straight to the
 * terminal.
 */
@Composable
internal fun HistorySheet(
    session: SessionKey,
    onLoad: (String) -> Unit,
    onSendNow: (String) -> Unit,
    onDismiss: () -> Unit,
    initialFilter: HistoryFilter = HistoryFilter.All,
    viewModel: HistoryViewModel = hiltViewModel<HistoryViewModel, HistoryViewModel.Factory>(
        creationCallback = { it.create(session) }
    )
) {
    LaunchedEffect(viewModel) { viewModel.setFilter(initialFilter) }
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var creatingFolder by remember { mutableStateOf(false) }
    var moving by remember { mutableStateOf<HistoryItem?>(null) }
    LaunchedEffect(state.items.size, state.stillPaging) { viewModel.pageIfEmpty() }
    val sheet = rememberModalSheetState()
    val actions = HistoryRowActions(
        onLoad = {
            onLoad(it.displayText())
            sheet.dismiss(onDismiss)
        },
        onSendNow = {
            onSendNow(it.displayText())
            sheet.dismiss(onDismiss)
        },
        onToggleFavorite = { viewModel.toggleFavorite(it.id) },
        onMove = { moving = it },
        onDelete = { viewModel.delete(it.id) }
    )
    LpmTheme(darkTheme = true) {
        ModalSheet(onDismissRequest = onDismiss, state = sheet) {
            SheetHeader(
                title = stringResource(R.string.history_title),
                trailing = stringResource(R.string.history_done) to { sheet.dismiss(onDismiss) }
            )
            SearchField(
                query = state.search,
                onQueryChange = viewModel::setSearch,
                placeholder = stringResource(R.string.history_search),
                modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp)
            )
            HistoryFilterBar(
                state = state,
                onFilter = viewModel::setFilter,
                onDeleteFolder = viewModel::deleteFolder,
                onNewFolder = { creatingFolder = true }
            )
            Box(Modifier.weight(1f).fillMaxWidth()) {
                if (state.showsEmpty) {
                    HistoryEmptyState(loading = state.loading, search = state.search)
                } else {
                    HistoryList(state, actions, onReachEnd = viewModel::loadMore)
                }
            }
        }
        if (creatingFolder) {
            NewFolderAlert(
                onCreate = {
                    viewModel.createFolder(it)
                    creatingFolder = false
                },
                onDismiss = { creatingFolder = false }
            )
        }
        moving?.let { item ->
            MoveToFolderDialog(
                item = item,
                folders = state.folders,
                onMove = { folder -> viewModel.setFolder(item.id, folder) },
                onNewFolder = { creatingFolder = true },
                onDismiss = { moving = null }
            )
        }
    }
}

@Composable
private fun HistoryList(state: HistoryUiState, actions: HistoryRowActions, onReachEnd: () -> Unit) {
    val reachEnd by rememberUpdatedState(onReachEnd)
    LazyColumn(Modifier.fillMaxSize()) {
        items(state.items, key = { it.id }) { item -> HistoryRow(item, actions) }
        // Paged by the raw page count, not the filtered rows, so a page with no
        // matching rows still asks for the next.
        if (state.stillPaging) {
            item {
                LaunchedEffect(state.items.size) { reachEnd() }
                Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                    ActivityIndicator(
                        size = ActivityIndicatorSize.Regular,
                        color = LpmTheme.colors.secondaryLabel
                    )
                }
            }
        }
    }
}

@Composable
private fun HistoryEmptyState(loading: Boolean, search: String) {
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center) {
        when {
            loading -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                ActivityIndicator(
                    size = ActivityIndicatorSize.Regular,
                    color = LpmTheme.colors.secondaryLabel
                )
            }

            search.isNotEmpty() -> EmptyMessage(
                title = stringResource(R.string.history_no_results, search),
                message = stringResource(R.string.history_no_results_message),
                icon = DesignR.drawable.ic_search
            )

            else -> EmptyMessage(
                title = stringResource(R.string.history_empty_title),
                message = stringResource(R.string.history_empty_message),
                icon = DesignR.drawable.ic_schedule
            )
        }
    }
}

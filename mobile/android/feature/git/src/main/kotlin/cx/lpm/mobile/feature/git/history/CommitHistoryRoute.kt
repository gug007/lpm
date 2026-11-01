package cx.lpm.mobile.feature.git.history

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation3.runtime.NavKey
import cx.lpm.mobile.core.navigation.GitCommitKey
import cx.lpm.mobile.core.navigation.GitHistoryKey
import kotlinx.coroutines.launch

/**
 * History wired to its ViewModel: the newest page is asked for once the link is ready,
 * once per visit to the screen; a reconnect re-asks through the store.
 */
@Composable
fun CommitHistoryRoute(
    key: GitHistoryKey,
    onNavigate: (NavKey) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: CommitHistoryViewModel =
        hiltViewModel<CommitHistoryViewModel, CommitHistoryViewModel.Factory>(
            creationCallback = { it.create(key) }
        )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var refreshing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(state.ready) {
        if (state.ready) viewModel.loadOnce()
    }
    CommitHistoryScreen(
        state = state,
        refreshing = refreshing,
        modifier = modifier,
        actions = HistoryActions(
            back = onBack,
            refresh = {
                scope.launch {
                    refreshing = true
                    viewModel.refresh()
                    refreshing = false
                }
            },
            retry = viewModel::load,
            loadMore = viewModel::loadMore,
            open = { onNavigate(GitCommitKey(key.project, it, key.session)) }
        )
    )
}

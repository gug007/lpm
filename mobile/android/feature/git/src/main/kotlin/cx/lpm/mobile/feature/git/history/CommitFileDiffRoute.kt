package cx.lpm.mobile.feature.git.history

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.navigation.GitCommitFileKey

/** One file's patch wired to its ViewModel: asked for once the link is ready, unless it's binary. */
@Composable
fun CommitFileDiffRoute(
    key: GitCommitFileKey,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: CommitFileDiffViewModel =
        hiltViewModel<CommitFileDiffViewModel, CommitFileDiffViewModel.Factory>(
            creationCallback = { it.create(key) }
        )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    LaunchedEffect(state.ready) {
        val patch = state.patch
        if (state.ready && !key.file.isBinary && patch.result == null && patch.error == null) {
            viewModel.load()
        }
    }
    CommitFileDiffScreen(
        state = state,
        modifier = modifier,
        onBack = onBack,
        onToggleWrap = viewModel::toggleWrap,
        onRetry = viewModel::load
    )
}

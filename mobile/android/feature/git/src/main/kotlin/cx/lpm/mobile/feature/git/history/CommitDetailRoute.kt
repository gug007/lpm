package cx.lpm.mobile.feature.git.history

import android.content.ClipData
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation3.runtime.NavKey
import cx.lpm.mobile.core.navigation.GitCommitFileKey
import cx.lpm.mobile.core.navigation.GitCommitKey
import kotlinx.coroutines.launch

/** One commit wired to its ViewModel: its files load when it comes up with the link ready. */
@Composable
fun CommitDetailRoute(
    key: GitCommitKey,
    onNavigate: (NavKey) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: CommitDetailViewModel =
        hiltViewModel<CommitDetailViewModel, CommitDetailViewModel.Factory>(
            creationCallback = { it.create(key) }
        )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val clipboard = LocalClipboard.current
    val haptics = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()
    LaunchedEffect(state.ready) {
        if (state.ready && state.files == null) viewModel.loadFiles()
    }

    fun copy(text: String) = scope.launch {
        clipboard.setClipEntry(ClipEntry(ClipData.newPlainText(text, text)))
    }

    CommitDetailScreen(
        state = state,
        modifier = modifier,
        actions = CommitDetailActions(
            back = onBack,
            copyHash = {
                copy(key.commit.hash)
                haptics.performHapticFeedback(HapticFeedbackType.Confirm)
            },
            copyMessage = { copy(key.commit.fullMessage) },
            retry = viewModel::loadFiles,
            open = { onNavigate(GitCommitFileKey(key.project, key.commit.hash, it, key.session)) }
        )
    )
}

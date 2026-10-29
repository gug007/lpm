package cx.lpm.mobile.feature.git.review

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleStartEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation3.runtime.NavKey
import cx.lpm.mobile.core.designsystem.component.AlertButton
import cx.lpm.mobile.core.designsystem.component.AlertRole
import cx.lpm.mobile.core.designsystem.component.LocalConfirmRisky
import cx.lpm.mobile.core.designsystem.component.LpmAlert
import cx.lpm.mobile.core.navigation.GitPullRequestKey
import cx.lpm.mobile.core.navigation.GitReviewKey
import cx.lpm.mobile.core.navigation.TerminalKey
import cx.lpm.mobile.feature.git.R
import cx.lpm.mobile.feature.git.ask.AgentAskSheet
import kotlinx.coroutines.launch

/**
 * The review screen wired to its ViewModel: it follows the working tree while open,
 * catches up when the app comes back, opens the commit sheet, and sends "Ask agent…"
 * to a terminal, opening it once the sheet has slid away.
 */
@Composable
fun GitReviewRoute(
    key: GitReviewKey,
    onNavigate: (NavKey) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: GitReviewViewModel = hiltViewModel<GitReviewViewModel, GitReviewViewModel.Factory>(
        creationCallback = { it.create(key) }
    )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var asking by remember { mutableStateOf<AskContext?>(null) }
    var committing by remember { mutableStateOf(false) }
    val confirmRisky = LocalConfirmRisky.current
    var refreshing by remember { mutableStateOf(false) }
    var backgrounded by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    DisposableEffect(viewModel) {
        viewModel.appear()
        onDispose { viewModel.disappear() }
    }
    LifecycleStartEffect(viewModel) {
        if (backgrounded) viewModel.resume()
        onStopOrDispose { backgrounded = true }
    }
    LaunchedEffect(state.opError) {
        if (state.opError != null) haptics.performHapticFeedback(HapticFeedbackType.Reject)
    }
    LaunchedEffect(state.notice) {
        if (state.notice != null) haptics.performHapticFeedback(HapticFeedbackType.Confirm)
    }

    GitReviewScreen(
        state = state,
        refreshing = refreshing,
        modifier = modifier,
        actions = ReviewActions(
            back = onBack,
            refresh = {
                scope.launch {
                    refreshing = true
                    viewModel.refresh()
                    refreshing = false
                }
            },
            retry = viewModel::load,
            fileAppeared = viewModel::fileAppeared,
            retryDiff = viewModel::retryDiff,
            toggleSelected = viewModel::toggleSelected,
            toggleCollapsed = viewModel::toggleCollapsed,
            toggleViewed = {
                haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
                viewModel.toggleViewed(it)
            },
            showAll = viewModel::showAll,
            toggleWrap = viewModel::toggleWrap,
            ask = { asking = viewModel.askContext(it) },
            openCommit = {
                committing = true
                viewModel.commitOpened()
            },
            createPullRequest = { onNavigate(GitPullRequestKey(key.project, key.session)) }
        )
    )

    if (committing) {
        GitCommitSheet(
            state = state,
            actions = CommitActions(
                setMessage = viewModel::setMessage,
                generateMessage = viewModel::generateMessage,
                toggleSelected = viewModel::toggleSelected,
                selectAll = viewModel::selectAll,
                commit = viewModel::commit,
                commitAndPush = {
                    confirmRisky.confirm("Commit and push ${key.project}") {
                        viewModel.commitAndPush()
                    }
                }
            ),
            onDismiss = { committing = false }
        )
    }

    asking?.let { context ->
        AgentAskSheet(
            context = context,
            terminals = state.terminals,
            onSend = { terminal, prompt ->
                viewModel.sendToAgent(terminal, prompt)
                asking = null
                onNavigate(TerminalKey(key.project, terminal.id, key.session))
            },
            onDismiss = { asking = null }
        )
    }
    state.opError?.let { error ->
        LpmAlert(
            title = error.title,
            message = error.message,
            buttons = listOf(AlertButton(stringResource(R.string.ok), AlertRole.Cancel)),
            onDismissRequest = viewModel::dismissOpError
        )
    }
}

package cx.lpm.mobile.feature.git.history

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.GlassIconButton
import cx.lpm.mobile.core.designsystem.component.LpmTopBar
import cx.lpm.mobile.core.designsystem.component.PlainListDefaults
import cx.lpm.mobile.core.designsystem.component.plainListSeparator
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.HistoryCommit
import cx.lpm.mobile.feature.git.R
import cx.lpm.mobile.feature.git.review.FileNote
import cx.lpm.mobile.feature.git.review.FileNoteRow

/** What History's controls do. */
@Immutable
class HistoryActions(
    val back: () -> Unit = {},
    val refresh: () -> Unit = {},
    val retry: () -> Unit = {},
    val loadMore: () -> Unit = {},
    val open: (HistoryCommit) -> Unit = {}
)

/**
 * The desktop's History for a project (iOS `CommitHistoryScreen`): the current
 * branch's commits, newest first, the ones no remote has yet marked, and a line where
 * the pushed ones start. A commit opens its message, its files and their patches.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CommitHistoryScreen(
    state: CommitHistoryUiState,
    refreshing: Boolean,
    modifier: Modifier = Modifier,
    actions: HistoryActions = HistoryActions()
) {
    Column(
        modifier
            .fillMaxSize()
            .background(LpmTheme.colors.systemBackground)
    ) {
        LpmTopBar(
            leading = {
                GlassIconButton(
                    icon = painterResource(DesignR.drawable.ic_arrow_back_ios_new),
                    contentDescription = stringResource(R.string.back),
                    onClick = actions.back
                )
            }
        ) { HistoryTitle(state.branch, state.unpushed, state.unpushedMore) }
        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = actions.refresh,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
        ) {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(top = PlainListDefaults.TopInset, bottom = 24.dp)
            ) {
                if (state.commits.isEmpty()) emptyState(state, actions.retry)
                commitRows(state, actions.open)
                if (state.hasMore) {
                    item(key = "more") {
                        LoadOlderRow(loading = state.loading, onClick = actions.loadMore)
                    }
                }
            }
        }
    }
}

private fun LazyListScope.commitRows(state: CommitHistoryUiState, onOpen: (HistoryCommit) -> Unit) {
    state.commits.forEachIndexed { index, commit ->
        if (index == state.boundary) {
            item(key = "pushed") { PushedDivider() }
        }
        item(key = commit.id) {
            HistoryCommitRow(
                commit = commit,
                ci = state.checks[commit.hash],
                now = state.now,
                first = index == 0,
                // The "Pushed" line hides the separators beside it.
                separator = index + 1 != state.boundary,
                onOpen = { onOpen(commit) }
            )
        }
    }
}

private fun LazyListScope.emptyState(state: CommitHistoryUiState, onRetry: () -> Unit) {
    item(key = "empty") {
        val error = state.error
        val separated = Modifier.plainListSeparator(LpmTheme.colors.listSeparator, top = true)
        when {
            error != null -> FileNoteRow(FileNote.Failed(error), onRetry, separated)

            state.loaded && !state.loading -> HistoryNoteLine(
                text = stringResource(R.string.git_history_empty),
                modifier = separated
            )

            else -> LoadingLine(stringResource(R.string.git_history_loading), separated)
        }
    }
}

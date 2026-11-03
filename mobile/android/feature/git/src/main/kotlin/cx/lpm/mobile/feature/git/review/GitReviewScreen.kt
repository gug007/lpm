package cx.lpm.mobile.feature.git.review

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.GlassIconButton
import cx.lpm.mobile.core.designsystem.component.LpmTopBar
import cx.lpm.mobile.core.designsystem.component.TopBarTitle
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.git.R
import cx.lpm.mobile.feature.git.diff.DiffBlockKind
import cx.lpm.mobile.feature.git.diff.DiffCodeBlock
import cx.lpm.mobile.feature.git.diff.DiffColors
import cx.lpm.mobile.feature.git.diff.HunkSeparator
import cx.lpm.mobile.feature.git.diff.WrappedDiffCodeBlock
import cx.lpm.mobile.feature.git.diff.rememberDiffColors
import cx.lpm.mobile.feature.git.ui.GitNoticeBanner
import kotlinx.coroutines.launch

/** What the review screen's controls do. */
@Immutable
class ReviewActions(
    val back: () -> Unit = {},
    val refresh: () -> Unit = {},
    val retry: () -> Unit = {},
    val fileAppeared: (String) -> Unit = {},
    val retryDiff: (String) -> Unit = {},
    val toggleSelected: (String) -> Unit = {},
    val toggleCollapsed: (String) -> Unit = {},
    val toggleViewed: (String) -> Unit = {},
    val showAll: (String) -> Unit = {},
    val toggleWrap: () -> Unit = {},
    val ask: (String) -> Unit = {},
    val openCommit: () -> Unit = {},
    val createPullRequest: () -> Unit = {},
    val undoDiscard: (id: String) -> Unit = {}
)

/**
 * The Git review screen (iOS `GitReviewView`): "Changes" over the +A −D and a jump
 * menu, how many files changed and how many are viewed, then every changed file with
 * its whole diff under a bar that pins while it scrolls, and a pinned "Commit N
 * files" that opens the commit sheet. Pull to refresh.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GitReviewScreen(
    state: GitReviewUiState,
    refreshing: Boolean,
    modifier: Modifier = Modifier,
    actions: ReviewActions = ReviewActions(),
    listState: LazyListState = rememberLazyListState()
) {
    val scope = rememberCoroutineScope()
    val headers = state.rows.filterIsInstance<ReviewRow.FileHeader>()
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
            },
            trailing = {
                if (headers.isNotEmpty()) {
                    JumpMenu(
                        files = headers,
                        onJump = { path ->
                            val index = state.rows.indexOfFirst { it.key == "h:$path" }
                            if (index >= 0) scope.launch { listState.animateScrollToItem(index) }
                        }
                    )
                }
            }
        ) { ChangesTitle(state.added, state.removed) }
        Box(Modifier.weight(1f)) {
            PullToRefreshBox(
                isRefreshing = refreshing,
                onRefresh = actions.refresh,
                modifier = Modifier.fillMaxSize()
            ) {
                ReviewList(
                    state = state,
                    actions = actions,
                    listState = listState,
                    onViewedToggle = { header ->
                        val index = state.rows.indexOf(header)
                        val pinned = index >= 0 && listState.firstVisibleItemIndex > index
                        actions.toggleViewed(header.path)
                        // A bar pinned over its scrolled diff would collapse out from
                        // under the screen: it goes back to the top instead, the next
                        // file right below it.
                        if (!header.viewed && !header.collapsed && pinned) {
                            scope.launch { listState.scrollToItem(index) }
                        }
                    }
                )
                ReviewOverlayContent(state, actions.retry, actions.createPullRequest)
            }
            GitNoticeBanner(
                notice = state.notice,
                modifier = Modifier.align(Alignment.TopCenter),
                onUndo = actions.undoDiscard
            )
        }
        if (headers.isNotEmpty()) {
            CommitBar(
                selected = state.selectedCount,
                committing = state.committing,
                onClick = actions.openCommit
            )
        }
    }
}

@Composable
private fun ReviewList(
    state: GitReviewUiState,
    actions: ReviewActions,
    listState: LazyListState,
    onViewedToggle: (ReviewRow.FileHeader) -> Unit
) {
    val colors = rememberDiffColors()
    LazyColumn(
        state = listState,
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 24.dp)
    ) {
        state.rows.forEach { row ->
            if (row is ReviewRow.FileHeader) {
                stickyHeader(key = row.key, contentType = ReviewRow.FileHeader::class) {
                    LaunchedEffect(row.path) { actions.fileAppeared(row.path) }
                    FileHeaderBar(
                        row,
                        state.wrap,
                        actions,
                        onViewedToggle = { onViewedToggle(row) }
                    )
                }
            } else {
                item(key = row.key, contentType = row::class) {
                    ReviewItem(row, state.wrap, actions, colors)
                }
            }
        }
    }
}

@Composable
private fun ReviewItem(row: ReviewRow, wrap: Boolean, actions: ReviewActions, colors: DiffColors) {
    when (row) {
        is ReviewRow.Summary -> ReviewSummary(row)

        is ReviewRow.FileHeader -> Unit

        is ReviewRow.Block -> when {
            row.block.kind == DiffBlockKind.Hunk -> HunkSeparator(row.block)
            wrap -> WrappedDiffCodeBlock(row.block, colors, Modifier.fillMaxWidth())
            else -> DiffCodeBlock(row.block, colors, Modifier.fillMaxWidth())
        }

        is ReviewRow.Note -> FileNoteRow(row.note, onRetry = { actions.retryDiff(row.path) })

        is ReviewRow.ShowAll -> ShowAllRow(row, onClick = { actions.showAll(row.path) })

        ReviewRow.CreatePullRequest -> CreatePullRequestRow(actions.createPullRequest)
    }
}

/** "Changes" over the +A −D across every parsed file, GitHub-style. */
@Composable
private fun ChangesTitle(added: Int, removed: Int) {
    val title = stringResource(R.string.git_review_title)
    if (added == 0 && removed == 0) return TopBarTitle(title = title)
    TopBarTitle(
        title = title,
        subtitleContent = {
            val style = LpmTheme.typography.footnote.copy(
                fontWeight = FontWeight.SemiBold,
                fontFeatureSettings = "tnum"
            )
            // A stack of its own on iOS, a little looser than a navigation subtitle.
            Row(
                modifier = Modifier.padding(top = 3.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text(
                    stringResource(R.string.git_review_added, added),
                    style = style,
                    color = LpmTheme.colors.green
                )
                Text(
                    stringResource(R.string.git_review_removed, removed),
                    style = style,
                    color = LpmTheme.colors.red
                )
            }
        }
    )
}

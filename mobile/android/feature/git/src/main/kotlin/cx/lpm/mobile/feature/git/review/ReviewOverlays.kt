package cx.lpm.mobile.feature.git.review

import androidx.annotation.DrawableRes
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.CapsuleButton
import cx.lpm.mobile.core.designsystem.component.EmptyState
import cx.lpm.mobile.core.designsystem.component.ListCard
import cx.lpm.mobile.core.designsystem.component.ListDefaults
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.component.Shimmer
import cx.lpm.mobile.core.designsystem.component.SkeletonBar
import cx.lpm.mobile.core.designsystem.component.plainListSeparator
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.git.R

/**
 * The loading ghost, "Can't reach your Mac" with Retry, "Not a git repository", or
 * "No changes" with "Create Pull Request" when the Mac has the GitHub CLI.
 */
@Composable
internal fun ReviewOverlayContent(
    state: GitReviewUiState,
    onRetry: () -> Unit,
    onCreatePullRequest: () -> Unit,
    modifier: Modifier = Modifier
) {
    when (val overlay = state.overlay ?: return) {
        ReviewOverlay.Skeleton -> ReviewSkeleton(modifier)

        ReviewOverlay.Unreachable, ReviewOverlay.BranchUnreachable -> Centered(modifier) {
            EmptyState(
                title = stringResource(
                    if (overlay == ReviewOverlay.Unreachable) {
                        R.string.git_review_unreachable
                    } else {
                        R.string.git_branch_unreachable
                    }
                ),
                icon = painterResource(DesignR.drawable.ic_wifi_off),
                description = { Description(state.loadError.orEmpty()) },
                actions = {
                    CapsuleButton(
                        text = stringResource(R.string.git_retry),
                        onClick = onRetry,
                        prominent = true,
                        textStyle = LpmTheme.typography.body
                    )
                }
            )
        }

        ReviewOverlay.NotRepo -> Message(
            stringResource(R.string.git_review_not_repo),
            DesignR.drawable.ic_folder_off,
            stringResource(R.string.git_review_not_repo_message),
            modifier
        )

        ReviewOverlay.NoChanges -> Centered(modifier) {
            EmptyState(
                title = stringResource(R.string.git_review_no_changes),
                icon = painterResource(DesignR.drawable.ic_check_circle),
                description = {
                    Description(stringResource(R.string.git_review_no_changes_message))
                },
                actions = if (state.ghCli) {
                    {
                        CapsuleButton(
                            text = stringResource(R.string.git_review_create_pr),
                            onClick = onCreatePullRequest,
                            textStyle = LpmTheme.typography.body,
                            leading = {
                                Icon(
                                    painter = painterResource(DesignR.drawable.ic_merge),
                                    contentDescription = null,
                                    tint = LpmTheme.colors.tint,
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        )
                    }
                } else {
                    null
                }
            )
        }

        ReviewOverlay.BranchNothing -> Message(
            stringResource(R.string.git_branch_nothing),
            DesignR.drawable.ic_merge,
            stringResource(R.string.git_branch_nothing_message),
            modifier
        )

        ReviewOverlay.BranchNoCommits -> Message(
            stringResource(R.string.git_branch_no_commits, state.branchBase),
            DesignR.drawable.ic_check_circle,
            stringResource(R.string.git_branch_no_commits_message),
            modifier
        )

        ReviewOverlay.BranchAllPushed -> Message(
            stringResource(R.string.git_branch_all_pushed),
            DesignR.drawable.ic_check_circle,
            stringResource(R.string.git_branch_all_pushed_message),
            modifier
        )
    }
}

/** A static overlay: what's up, and a line on why. */
@Composable
private fun Message(
    title: String,
    @DrawableRes icon: Int,
    message: String,
    modifier: Modifier = Modifier
) {
    Centered(modifier) {
        EmptyState(title = title, icon = painterResource(icon), description = {
            Description(message)
        })
    }
}

@Composable
private fun Centered(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) { content() }
}

@Composable
private fun Description(text: String) {
    Text(
        text = text,
        style = LpmTheme.typography.body,
        color = LpmTheme.colors.secondaryLabel,
        textAlign = TextAlign.Center
    )
}

/** The summary and four file bars, shimmering, until the first snapshot. */
@Composable
private fun ReviewSkeleton(modifier: Modifier = Modifier) {
    val fill = LpmTheme.colors.tertiarySystemFill
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(LpmTheme.colors.systemBackground)
    ) {
        Shimmer {
            Column(
                Modifier.padding(horizontal = 16.dp, vertical = 18.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                SkeletonBar(width = 120.dp)
                Box(Modifier.fillMaxWidth().height(4.dp).background(fill, CircleShape))
            }
        }
        listOf(160, 120, 190, 140).forEach { width ->
            Shimmer {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = ListDefaults.RowMinHeight)
                        .plainListSeparator(LpmTheme.colors.separator)
                        .padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(Modifier.size(18.dp).background(fill, RoundedCornerShape(5.dp)))
                    SkeletonBar(width = width.dp)
                }
            }
        }
    }
}

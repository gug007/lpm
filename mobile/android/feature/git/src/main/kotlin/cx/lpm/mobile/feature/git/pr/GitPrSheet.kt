package cx.lpm.mobile.feature.git.pr

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ActivityIndicatorSize
import cx.lpm.mobile.core.designsystem.component.AlertButton
import cx.lpm.mobile.core.designsystem.component.AlertRole
import cx.lpm.mobile.core.designsystem.component.CapsuleButton
import cx.lpm.mobile.core.designsystem.component.EmptyState
import cx.lpm.mobile.core.designsystem.component.GlassCapsuleButton
import cx.lpm.mobile.core.designsystem.component.ListDefaults
import cx.lpm.mobile.core.designsystem.component.ListHeaderStyle
import cx.lpm.mobile.core.designsystem.component.ListLeadingSlot
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.component.ListSection
import cx.lpm.mobile.core.designsystem.component.LpmAlert
import cx.lpm.mobile.core.designsystem.component.TextFieldRow
import cx.lpm.mobile.core.designsystem.component.ToggleRow
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.navigation.GitPullRequestKey
import cx.lpm.mobile.feature.git.R
import cx.lpm.mobile.feature.git.ui.BarSpinner
import cx.lpm.mobile.feature.git.ui.SheetBar

/** The pull request sheet's content, wired to its ViewModel. */
@Composable
fun GitPrRoute(
    key: GitPullRequestKey,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: GitPrViewModel = hiltViewModel<GitPrViewModel, GitPrViewModel.Factory>(
        creationCallback = { it.create(key) }
    )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val haptics = LocalHapticFeedback.current
    LaunchedEffect(state.createdUrl) {
        if (state.createdUrl != null) haptics.performHapticFeedback(HapticFeedbackType.Confirm)
    }
    GitPrSheet(
        state = state,
        modifier = modifier,
        onDismiss = onDismiss,
        onTitle = viewModel::setTitle,
        onBody = viewModel::setBody,
        onCloseIssue = viewModel::setCloseIssue,
        onGenerate = viewModel::generate,
        onCreate = viewModel::create
    )
    state.error?.let { error ->
        LpmAlert(
            title = stringResource(R.string.git_pr_error),
            message = error,
            buttons = listOf(AlertButton(stringResource(R.string.ok), AlertRole.Cancel)),
            onDismissRequest = viewModel::dismissError
        )
    }
}

/**
 * "Pull Request" (iOS `GitPrSheet`): Cancel, the title and description with "Generate
 * with AI", and Create; once created, the link with Done.
 */
@Composable
fun GitPrSheet(
    state: GitPrUiState,
    onDismiss: () -> Unit,
    onTitle: (String) -> Unit,
    onBody: (String) -> Unit,
    onCloseIssue: (Boolean) -> Unit,
    onGenerate: () -> Unit,
    onCreate: () -> Unit,
    modifier: Modifier = Modifier
) {
    // Once created there's no form, so the sheet takes the plain background.
    val plain = if (state.createdUrl != null) {
        Modifier.background(LpmTheme.colors.systemBackground)
    } else {
        Modifier
    }
    Column(modifier.fillMaxSize().then(plain)) {
        SheetBar(
            title = stringResource(R.string.git_pr_title),
            leading = {
                GlassCapsuleButton(
                    text = stringResource(
                        if (state.createdUrl ==
                            null
                        ) {
                            R.string.cancel
                        } else {
                            R.string.done
                        }
                    ),
                    onClick = onDismiss
                )
            },
            trailing = {
                when {
                    state.createdUrl != null -> Unit

                    state.creating -> BarSpinner()

                    else -> GlassCapsuleButton(
                        text = stringResource(R.string.git_pr_create),
                        onClick = onCreate,
                        enabled = state.canCreate,
                        textStyle = LpmTheme.typography.headline
                    )
                }
            }
        )
        val url = state.createdUrl
        if (url != null) {
            Created(url)
        } else {
            PrForm(state, onTitle, onBody, onCloseIssue, onGenerate)
        }
    }
}

@Composable
private fun PrForm(
    state: GitPrUiState,
    onTitle: (String) -> Unit,
    onBody: (String) -> Unit,
    onCloseIssue: (Boolean) -> Unit,
    onGenerate: () -> Unit
) {
    Column(
        Modifier
            .fillMaxWidth()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(top = ListDefaults.ContentTopPadding, bottom = 24.dp)
    ) {
        ListSection(
            header = stringResource(R.string.git_pr_field_title),
            headerStyle = ListHeaderStyle.Title
        ) {
            TextFieldRow(
                value = state.title,
                onValueChange = onTitle,
                placeholder = stringResource(R.string.git_pr_field_title),
                maxLines = 3
            )
        }
        ListSection(
            header = stringResource(R.string.git_pr_field_description),
            headerStyle = ListHeaderStyle.Title
        ) {
            TextFieldRow(
                value = state.body,
                onValueChange = onBody,
                placeholder = stringResource(R.string.git_pr_field_description),
                minLines = 4,
                maxLines = 16
            )
        }
        state.issue?.let { issue ->
            ListSection(footer = stringResource(R.string.git_pr_close_issue_footer, issue)) {
                ToggleRow(
                    title = stringResource(R.string.git_pr_close_issue, issue),
                    checked = state.closeIssue,
                    onCheckedChange = onCloseIssue
                )
            }
        }
        ListSection(footer = stringResource(R.string.git_pr_footer)) {
            GenerateRow(state.generating, onGenerate)
        }
    }
}

/** "Generate with AI", a spinner and "Generating…" while the Mac drafts. */
@Composable
private fun GenerateRow(generating: Boolean, onClick: () -> Unit) {
    val colors = LpmTheme.colors
    // An HStack of icon and text rather than a Label, so the text sits closer.
    ListRow(
        onClick = onClick,
        enabled = !generating,
        leadingSlot = ListLeadingSlot(width = 20.dp, spacing = 8.dp),
        leading = {
            if (generating) {
                ActivityIndicator(size = ActivityIndicatorSize.Small)
            } else {
                Icon(
                    painter = painterResource(DesignR.drawable.ic_auto_awesome),
                    contentDescription = null,
                    tint = colors.tint,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    ) {
        Text(
            text = stringResource(
                if (generating) R.string.git_commit_generating else R.string.git_pr_generate
            ),
            style = LpmTheme.typography.body,
            color = if (generating) colors.tertiaryLabel else colors.tint
        )
    }
}

/** The created pull request: its link, selectable, and Open. */
@Composable
private fun Created(url: String) {
    val uriHandler = LocalUriHandler.current
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        EmptyState(
            title = stringResource(R.string.git_pr_created),
            icon = painterResource(DesignR.drawable.ic_verified_fill),
            description = {
                SelectionContainer {
                    Text(
                        text = url,
                        style = LpmTheme.typography.footnote,
                        color = LpmTheme.colors.secondaryLabel,
                        textAlign = TextAlign.Center
                    )
                }
            },
            actions = {
                CapsuleButton(
                    text = stringResource(R.string.git_pr_open),
                    onClick = { runCatching { uriHandler.openUri(url) } },
                    prominent = true,
                    textStyle = LpmTheme.typography.body,
                    leading = {
                        Icon(
                            painter = painterResource(DesignR.drawable.ic_explore),
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                )
            }
        )
    }
}

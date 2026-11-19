package cx.lpm.mobile.feature.projects.review

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ButtonRow
import cx.lpm.mobile.core.designsystem.component.EmptyState
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.component.ListSection
import cx.lpm.mobile.core.designsystem.component.ModalSheet
import cx.lpm.mobile.core.designsystem.component.SheetScaffold
import cx.lpm.mobile.core.designsystem.component.rememberModalSheetState
import cx.lpm.mobile.core.designsystem.theme.AppAppearance
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.LaunchpadOption
import cx.lpm.mobile.core.model.PrDiscussion
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.core.navigation.PresentationScope
import cx.lpm.mobile.feature.projects.ActionRunStepHost
import cx.lpm.mobile.feature.projects.R
import cx.lpm.mobile.feature.projects.ci.CiFixRows
import cx.lpm.mobile.feature.projects.newtab.ActionInputsSlot

/**
 * The review on the branch's pull request, as the desktop's "@" menu reads it (iOS
 * `PrReviewSheet`): each verdict, line comment and reply, oldest first, and a way to
 * hand them to any agent the project's New Tab sheet offers, in a new tab.
 */
@Composable
internal fun PrReviewSheet(
    project: String,
    session: SessionKey,
    onSpawnedTerminal: (TerminalInfo) -> Unit,
    actionInputs: ActionInputsSlot,
    onDismiss: () -> Unit,
    viewModel: PrReviewViewModel =
        hiltViewModel<PrReviewViewModel, PrReviewViewModel.Factory>(
            key = "pr-review:$session:$project",
            creationCallback = { it.create(project, session) }
        )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    LaunchedEffect(viewModel) { viewModel.load() }
    PresentationScope {
        AppAppearance {
            val sheet = rememberModalSheetState()
            val haptics = LocalHapticFeedback.current
            val sent = {
                haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
                sheet.dismiss(onDismiss)
            }
            ModalSheet(onDismissRequest = onDismiss, state = sheet) {
                SheetScaffold(title = stringResource(R.string.review_title), onDone = {
                    sheet.dismiss(onDismiss)
                }) {
                    val discussion = state.discussion
                    if (discussion == null) {
                        EmptyState(
                            title = stringResource(R.string.review_none_title),
                            icon = painterResource(DesignR.drawable.ic_merge),
                            description = { Text(stringResource(R.string.review_none_description)) }
                        )
                    } else {
                        ReviewList(state, discussion) {
                            if (viewModel.send(it, onSpawnedTerminal)) sent()
                        }
                    }
                }
            }
            ActionRunStepHost(
                state.step,
                actionInputs,
                onSubmit = { values ->
                    if (viewModel.submitInputs(values, onSpawnedTerminal)) sent()
                },
                onConfirm = {
                    viewModel.confirm(onSpawnedTerminal)
                    sent()
                },
                onDismiss = viewModel::dismissStep
            )
        }
    }
}

@Composable
private fun ReviewList(
    state: PrReviewUiState,
    discussion: PrDiscussion,
    onSend: (LaunchpadOption) -> Unit
) {
    val colors = LpmTheme.colors
    val uri = LocalUriHandler.current
    Column(Modifier.verticalScroll(rememberScrollState())) {
        ListSection(
            headerContent = {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        stringResource(R.string.review_on, discussion.number),
                        style = LpmTheme.typography.footnote,
                        color = colors.secondaryLabel
                    )
                    if (discussion.title.isNotEmpty()) {
                        Text(
                            discussion.title,
                            style = LpmTheme.typography.footnote,
                            color = colors.secondaryLabel,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }
        ) {
            if (discussion.notes.isEmpty()) {
                ListRow {
                    Text(
                        stringResource(R.string.review_no_comments),
                        style = LpmTheme.typography.body,
                        color = colors.secondaryLabel
                    )
                }
            }
            discussion.notes.forEach { NoteRow(it) }
        }
        ListSection {
            if (discussion.comments.isNotEmpty() && discussion.prompt.isNotEmpty() &&
                state.canSend
            ) {
                CiFixRows(
                    state.tabs,
                    onSend,
                    detail = R.string.review_send_description,
                    verb = R.string.review_send
                )
            }
            if (discussion.url.isNotEmpty()) {
                ButtonRow(
                    text = stringResource(R.string.review_open_github),
                    onClick = { uri.openUri(discussion.url) },
                    icon = painterResource(DesignR.drawable.ic_open_in_new)
                )
            }
        }
    }
}

/** One verdict, line comment or reply: who, what and where, then what they wrote. */
@Composable
private fun NoteRow(note: PrDiscussion.Note) {
    val colors = LpmTheme.colors
    ListRow(modifier = Modifier.semantics(mergeDescendants = true) {}) {
        Column(
            Modifier.padding(vertical = 2.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.Bottom
            ) {
                Text(
                    note.author,
                    style = LpmTheme.typography.subheadline.copy(fontWeight = FontWeight.SemiBold),
                    color = colors.label
                )
                val verdict = verdictText(note.state)
                val place = note.place
                if (note.kind == PrDiscussion.Note.Kind.REVIEW && verdict != null) {
                    Text(
                        verdict,
                        style = LpmTheme.typography.caption1.copy(fontWeight = FontWeight.Medium),
                        color = when (note.state) {
                            "CHANGES_REQUESTED" -> colors.orange
                            "APPROVED" -> colors.green
                            else -> colors.secondaryLabel
                        }
                    )
                } else if (place != null) {
                    Text(
                        place,
                        style = LpmTheme.typography.caption1.copy(
                            fontFamily = FontFamily.Monospace
                        ),
                        color = colors.secondaryLabel,
                        maxLines = 1,
                        overflow = TextOverflow.StartEllipsis
                    )
                }
            }
            if (note.body.isNotEmpty()) {
                SelectionContainer {
                    Text(note.body, style = LpmTheme.typography.callout, color = colors.label)
                }
            }
        }
    }
}

/** "requested changes", "approved"; a state it doesn't know reads as the Mac sent it. */
@Composable
private fun verdictText(state: String): String? = when (state) {
    "APPROVED" -> stringResource(R.string.review_verdict_approved)
    "CHANGES_REQUESTED" -> stringResource(R.string.review_verdict_changes)
    "COMMENTED" -> stringResource(R.string.review_verdict_commented)
    "DISMISSED" -> stringResource(R.string.review_verdict_dismissed)
    else -> state.lowercase().ifEmpty { null }
}

package cx.lpm.mobile.feature.git.history

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.GlassIconButton
import cx.lpm.mobile.core.designsystem.component.ListCard
import cx.lpm.mobile.core.designsystem.component.ListDefaults
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.component.ListSection
import cx.lpm.mobile.core.designsystem.component.LpmTopBar
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.CommitFile
import cx.lpm.mobile.feature.git.R
import cx.lpm.mobile.feature.git.review.FileNote
import cx.lpm.mobile.feature.git.review.FileNoteRow

/** What a commit's screen does. */
@Immutable
class CommitDetailActions(
    val back: () -> Unit = {},
    val copyHash: () -> Unit = {},
    val copyMessage: () -> Unit = {},
    val retry: () -> Unit = {},
    val open: (CommitFile) -> Unit = {}
)

/**
 * One commit (iOS `CommitDetailScreen`): its message, who wrote it and with which
 * agent, and the files it changed. A file opens its patch in the commit.
 */
@Composable
fun CommitDetailScreen(
    state: CommitDetailUiState,
    modifier: Modifier = Modifier,
    actions: CommitDetailActions = CommitDetailActions()
) {
    Column(
        modifier
            .fillMaxSize()
            .background(LpmTheme.colors.systemGroupedBackground)
    ) {
        LpmTopBar(
            title = state.commit.short,
            leading = {
                GlassIconButton(
                    icon = painterResource(DesignR.drawable.ic_arrow_back_ios_new),
                    contentDescription = stringResource(R.string.back),
                    onClick = actions.back
                )
            },
            trailing = { CommitMoreMenu(actions.copyHash, actions.copyMessage) }
        )
        Column(
            Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(top = ListDefaults.ContentTopPadding, bottom = 24.dp)
        ) {
            ListSection {
                ListRow(verticalPadding = ListDefaults.RowVerticalPadding + 4.dp) {
                    CommitHeader(state.commit, onCopyHash = actions.copyHash, Modifier.weight(1f))
                }
            }
            FilesSection(state, actions)
        }
    }
}

/** The files the commit changed under "N files" and their +A −D, or why they aren't there. */
@Composable
private fun FilesSection(state: CommitDetailUiState, actions: CommitDetailActions) {
    val files = state.files
    val error = state.error
    Column(Modifier.padding(horizontal = ListDefaults.Margin)) {
        CommitFilesHeader(files)
        ListCard {
            when {
                files != null -> {
                    if (files.isEmpty()) {
                        HistoryNoteLine(
                            text = stringResource(R.string.git_history_no_files),
                            minHeight = ListDefaults.RowMinHeight,
                            verticalPadding = ListDefaults.RowVerticalPadding
                        )
                    }
                    files.forEach { file ->
                        HistoryFileRow(file, onClick = { actions.open(file) })
                    }
                }

                error != null -> FileNoteRow(FileNote.Failed(error), actions.retry)

                else -> LoadingLine(
                    text = stringResource(R.string.git_history_loading_files),
                    minHeight = ListDefaults.RowMinHeight,
                    verticalPadding = ListDefaults.RowVerticalPadding
                )
            }
        }
        Spacer(Modifier.height(25.6.dp))
    }
}

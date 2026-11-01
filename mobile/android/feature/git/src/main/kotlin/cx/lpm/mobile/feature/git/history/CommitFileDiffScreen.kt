package cx.lpm.mobile.feature.git.history

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.GlassIconButton
import cx.lpm.mobile.core.designsystem.component.LpmTopBar
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.git.R
import cx.lpm.mobile.feature.git.diff.DiffBlockKind
import cx.lpm.mobile.feature.git.diff.DiffCodeBlock
import cx.lpm.mobile.feature.git.diff.DiffColors
import cx.lpm.mobile.feature.git.diff.HunkSeparator
import cx.lpm.mobile.feature.git.diff.WrappedDiffCodeBlock
import cx.lpm.mobile.feature.git.diff.rememberDiffColors
import cx.lpm.mobile.feature.git.review.FileNote
import cx.lpm.mobile.feature.git.review.FileNoteRow
import cx.lpm.mobile.feature.git.review.TogglePill

/** One file's patch in a commit (iOS `CommitFileDiffScreen`), drawn the way Review Changes draws a diff. */
@Composable
fun CommitFileDiffScreen(
    state: CommitFileDiffUiState,
    modifier: Modifier = Modifier,
    onBack: () -> Unit = {},
    onToggleWrap: () -> Unit = {},
    onRetry: () -> Unit = {}
) {
    val colors = rememberDiffColors()
    Column(
        modifier
            .fillMaxSize()
            .background(LpmTheme.colors.systemBackground)
    ) {
        LpmTopBar(
            title = state.file.name,
            leading = {
                GlassIconButton(
                    icon = painterResource(DesignR.drawable.ic_arrow_back_ios_new),
                    contentDescription = stringResource(R.string.back),
                    onClick = onBack
                )
            },
            trailing = {
                TogglePill(
                    on = state.wrap,
                    onToggle = onToggleWrap,
                    label = stringResource(R.string.git_file_wrap),
                    tint = LpmTheme.colors.tint,
                    role = Role.Switch
                )
            }
        )
        LazyColumn(
            Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentPadding = PaddingValues(bottom = 24.dp)
        ) {
            patchRows(state, colors, onRetry)
            if (state.patch.result?.truncated == true) {
                item(key = "truncated") {
                    InlineNote(
                        icon = painterResource(DesignR.drawable.ic_content_cut),
                        text = stringResource(R.string.git_history_truncated)
                    )
                }
            }
        }
    }
}

private fun LazyListScope.patchRows(
    state: CommitFileDiffUiState,
    colors: DiffColors,
    onRetry: () -> Unit
) {
    val parsed = state.parsed
    val error = state.patch.error
    when {
        state.file.isBinary -> item(key = "note") { FileNoteRow(FileNote.Binary, onRetry) }

        parsed != null -> {
            if (parsed.blocks.isEmpty()) {
                item(key = "note") { FileNoteRow(FileNote.Empty, onRetry) }
            }
            parsed.blocks.forEach { block ->
                item(key = block.id, contentType = block.kind) {
                    when {
                        block.kind == DiffBlockKind.Hunk -> HunkSeparator(block)
                        state.wrap -> WrappedDiffCodeBlock(block, colors, Modifier.fillMaxWidth())
                        else -> DiffCodeBlock(block, colors, Modifier.fillMaxWidth())
                    }
                }
            }
        }

        error != null -> item(key = "note") { FileNoteRow(FileNote.Failed(error), onRetry) }

        else -> item(key = "note") { FileNoteRow(FileNote.Loading, onRetry) }
    }
}

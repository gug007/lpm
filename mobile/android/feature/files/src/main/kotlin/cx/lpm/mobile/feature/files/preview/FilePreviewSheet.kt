package cx.lpm.mobile.feature.files.preview

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.CapsuleButton
import cx.lpm.mobile.core.designsystem.component.EmptyState
import cx.lpm.mobile.core.designsystem.component.GlassCapsuleButton
import cx.lpm.mobile.core.designsystem.component.GlassIconButton
import cx.lpm.mobile.core.designsystem.component.LpmTopBar
import cx.lpm.mobile.core.designsystem.component.TopBarTitle
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.files.R
import cx.lpm.mobile.feature.files.fetch.FileFetch
import java.io.File

/**
 * Opens any file on the Mac, like the desktop's file viewer (iOS `FilePreviewSheet`):
 * "Done" and the file's name over its folder and line, the copy's progress, the reason
 * it failed with Retry, or the file itself — with Share once the whole file is here,
 * and [nextSteps] under it.
 */
@Composable
fun FilePreviewSheet(
    state: FilePreviewUiState,
    onDone: () -> Unit,
    onShare: (File) -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
    nextSteps: @Composable () -> Unit = {},
    content: @Composable (FileFetch.Phase.Ready) -> Unit
) {
    Column(
        modifier
            .fillMaxSize()
            .background(LpmTheme.colors.systemBackground)
    ) {
        val shareable = state.shareable
        LpmTopBar(
            modifier = Modifier
                .background(if (state.barred) LpmTheme.colors.barMaterial else Color.Transparent)
                .padding(top = 16.dp, bottom = 10.dp),
            windowInsets = WindowInsets(0),
            leading = {
                GlassCapsuleButton(text = stringResource(R.string.files_done), onClick = onDone)
            },
            trailing = shareable?.let { file ->
                {
                    GlassIconButton(
                        icon = painterResource(DesignR.drawable.ic_ios_share),
                        contentDescription = stringResource(R.string.files_share_toolbar),
                        onClick = { onShare(file) }
                    )
                }
            }
        ) {
            PreviewTitle(state)
        }
        Box(
            Modifier
                .weight(1f)
                .fillMaxWidth()
        ) {
            when (val phase = state.phase) {
                FileFetch.Phase.Loading -> LoadingState(state)
                is FileFetch.Phase.Failed -> ErrorState(phase.message, state.path, onRetry)
                is FileFetch.Phase.Ready -> content(phase)
            }
        }
        if (state.ready) nextSteps()
    }
}

/** The file's name over "<folder> · line N", the folder cut from its start when long. */
@Composable
private fun PreviewTitle(state: FilePreviewUiState) {
    val line = if (state.line > 0) stringResource(R.string.files_line, state.line) else ""
    val subtitle = listOf(state.folder, line).filter { it.isNotEmpty() }.joinToString(" · ")
    if (subtitle.isEmpty()) {
        TopBarTitle(title = state.filename)
        return
    }
    TopBarTitle(
        title = state.filename,
        subtitleContent = {
            Text(
                text = subtitle,
                style = LpmTheme.typography.caption2,
                color = LpmTheme.colors.secondaryLabel,
                maxLines = 1,
                overflow = TextOverflow.StartEllipsis
            )
        }
    )
}

@Composable
private fun LoadingState(state: FilePreviewUiState) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically)
    ) {
        Icon(
            painter = painterResource(DesignR.drawable.ic_description),
            contentDescription = null,
            tint = LpmTheme.colors.secondaryLabel,
            modifier = Modifier.size(48.dp)
        )
        Text(
            text = state.filename,
            style = LpmTheme.typography.headline,
            textAlign = TextAlign.Center
        )
        Text(
            text = state.path,
            style = LpmTheme.typography.caption1.copy(fontFamily = FontFamily.Monospace),
            color = LpmTheme.colors.secondaryLabel,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center
        )
        Box(Modifier.padding(top = 8.dp)) { Progress(state) }
    }
}

@Composable
private fun Progress(state: FilePreviewUiState) {
    val fraction = state.progress
    val total = state.total
    if (fraction == null || total == null) {
        ActivityIndicator()
        return
    }
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        LinearProgress(fraction)
        Text(
            text = stringResource(
                R.string.files_progress,
                ByteCount.format(state.received),
                ByteCount.format(total)
            ),
            style = LpmTheme.typography.footnote.copy(
                fontFeatureSettings = "tnum"
            ),
            color = LpmTheme.colors.secondaryLabel
        )
    }
}

@Composable
private fun ErrorState(message: String, path: String, onRetry: () -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        EmptyState(
            title = stringResource(R.string.files_open_failed),
            icon = painterResource(DesignR.drawable.ic_unknown_document),
            description = {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = message,
                        style = LpmTheme.typography.body,
                        color = LpmTheme.colors.secondaryLabel,
                        textAlign = TextAlign.Center
                    )
                    Text(
                        text = path,
                        style = LpmTheme.typography.caption1.copy(
                            fontFamily = FontFamily.Monospace
                        ),
                        color = LpmTheme.colors.secondaryLabel,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                        textAlign = TextAlign.Center
                    )
                }
            },
            actions = {
                CapsuleButton(
                    text = stringResource(R.string.files_retry),
                    onClick = onRetry,
                    prominent = true,
                    textStyle = LpmTheme.typography.body
                )
            }
        )
    }
}

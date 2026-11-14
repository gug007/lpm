package cx.lpm.mobile.feature.files.preview

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.navigation.FilePreviewKey
import cx.lpm.mobile.core.web.MarkdownWebView
import java.io.File
import kotlinx.coroutines.launch

/**
 * The preview sheet for [key], wired to its ViewModel: Share hands the copy to the
 * system share sheet, a file a Markdown file links to opens through [onOpenFile], in a
 * sheet of its own, and Diff opens Changes on the file through [onOpenChanges].
 */
@Composable
fun FilePreviewRoute(
    key: FilePreviewKey,
    onDismiss: () -> Unit,
    onOpenFile: (List<String>) -> Unit,
    onOpenChanges: (path: String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: FilePreviewViewModel =
        hiltViewModel<FilePreviewViewModel, FilePreviewViewModel.Factory>(
            creationCallback = { it.create(key) }
        )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val haptics = LocalHapticFeedback.current
    val clipboard = LocalClipboard.current
    val scope = rememberCoroutineScope()
    val share = remember(context) { { file: File -> context.share(file) } }
    val dark = LpmTheme.colors.isDark
    val actions = FilePreviewActions(
        onMarkdownSource = viewModel::setMarkdownSource,
        markdown = { text, textModifier ->
            MarkdownWebView(
                text = text,
                project = key.project,
                path = state.path,
                fileReader = viewModel.imageReader,
                onOpenFile = onOpenFile,
                modifier = textModifier,
                darkTheme = dark
            )
        },
        document = { file, documentModifier ->
            DocumentPreview(
                file,
                viewModel.deviceNoun,
                share,
                viewModel.renderDispatcher,
                documentModifier
            )
        },
        media = { file, mediaModifier -> MediaPlayer(file, mediaModifier) }
    )
    FilePreviewSheet(
        state = state,
        onDone = onDismiss,
        onShare = share,
        onRetry = viewModel::retry,
        modifier = modifier,
        nextSteps = {
            FilePreviewActionBar(
                onMention = if (state.canMention) {
                    {
                        viewModel.mention()
                        haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
                        onDismiss()
                    }
                } else {
                    null
                },
                onDiff = state.changedPath?.let { path -> { onOpenChanges(path) } },
                onCopyPath = {
                    val path = state.projectPath
                    val clip = ClipEntry(ClipData.newPlainText(path, path))
                    scope.launch { clipboard.setClipEntry(clip) }
                }
            )
        }
    ) { ready ->
        FilePreviewContent(ready = ready, state = state, line = key.line, actions = actions)
    }
}

private fun Context.share(file: File) {
    try {
        startActivity(FilePreviewProvider.shareIntent(this, file))
    } catch (_: ActivityNotFoundException) {
    }
}

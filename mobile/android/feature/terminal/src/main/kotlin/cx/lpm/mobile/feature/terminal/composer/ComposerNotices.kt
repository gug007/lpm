package cx.lpm.mobile.feature.terminal.composer

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import cx.lpm.mobile.core.ui.ComposerToast
import cx.lpm.mobile.feature.terminal.R

/** The composer's toast: a send problem, a saved draft, a failed rewrite, an attachment that can't go. */
@Composable
internal fun ComposerNotices(
    state: ComposerUiState,
    onDismissWarning: () -> Unit,
    onDismissCommandNotice: () -> Unit,
    onDismissRewriteError: () -> Unit,
    onDismissUploadError: () -> Unit,
    onOpenDrafts: () -> Unit,
    modifier: Modifier = Modifier
) {
    val warning = state.sendWarning
    val notice = state.commandNotice
    val (text, dismiss) = when {
        warning != null -> stringResource(warning) to onDismissWarning

        notice is CommandNotice.FillIn ->
            stringResource(R.string.composer_fill_in, notice.variables) to onDismissCommandNotice

        notice is CommandNotice.Failed -> notice.error to onDismissCommandNotice

        state.composer.transformError != null ->
            state.composer.transformError to onDismissRewriteError

        state.composer.uploadError != null -> state.composer.uploadError to onDismissUploadError

        else -> null to {}
    }
    ComposerToast(
        text = text,
        onDismiss = dismiss,
        modifier = modifier,
        action = stringResource(R.string.composer_open_drafts).takeIf {
            warning == R.string.composer_saved_to_drafts
        },
        onAction = onOpenDrafts
    )
}

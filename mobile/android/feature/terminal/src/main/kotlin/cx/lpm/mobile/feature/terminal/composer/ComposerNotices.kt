package cx.lpm.mobile.feature.terminal.composer

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import cx.lpm.mobile.core.ui.ComposerToast
import cx.lpm.mobile.feature.terminal.R

/** What the composer's toast does: dismiss each kind of notice, and its buttons. */
internal class ComposerNoticeActions(
    val onDismissWarning: () -> Unit,
    val onDismissCommandNotice: () -> Unit,
    val onDismissIssueError: () -> Unit,
    val onDismissRewriteError: () -> Unit,
    val onDismissUploadError: () -> Unit,
    val onDismissRestore: () -> Unit,
    val onOpenDrafts: () -> Unit,
    val onRestore: (ComposerRestore) -> Unit
)

/**
 * The composer's toast: a send problem, a saved draft, a History pick added after the
 * draft, an issue that couldn't be read, a failed rewrite, an attachment that can't go.
 */
@Composable
internal fun ComposerNotices(
    state: ComposerUiState,
    actions: ComposerNoticeActions,
    modifier: Modifier = Modifier
) {
    val warning = state.sendWarning
    val restore = state.restore
    val notice = state.commandNotice
    val (text, dismiss) = when {
        warning != null -> stringResource(warning) to actions.onDismissWarning

        restore != null ->
            stringResource(R.string.composer_added_after_draft) to actions.onDismissRestore

        notice is CommandNotice.FillIn ->
            stringResource(R.string.composer_fill_in, notice.variables) to
                actions.onDismissCommandNotice

        notice is CommandNotice.Failed -> notice.error to actions.onDismissCommandNotice

        state.issueError != null -> state.issueError to actions.onDismissIssueError

        state.composer.transformError != null ->
            state.composer.transformError to actions.onDismissRewriteError

        state.composer.uploadError != null ->
            state.composer.uploadError to actions.onDismissUploadError

        else -> null to {}
    }
    val (action, onAction) = when {
        warning == R.string.composer_saved_to_drafts ->
            stringResource(R.string.composer_open_drafts) to actions.onOpenDrafts

        warning == null && restore != null ->
            stringResource(R.string.composer_undo) to { actions.onRestore(restore) }

        else -> null to {}
    }
    ComposerToast(
        text = text,
        onDismiss = dismiss,
        modifier = modifier,
        action = action,
        onAction = onAction
    )
}

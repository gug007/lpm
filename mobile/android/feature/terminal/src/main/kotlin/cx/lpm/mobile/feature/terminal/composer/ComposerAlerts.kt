package cx.lpm.mobile.feature.terminal.composer

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import cx.lpm.mobile.core.designsystem.component.AlertButton
import cx.lpm.mobile.core.designsystem.component.AlertRole
import cx.lpm.mobile.core.designsystem.component.LpmAlert
import cx.lpm.mobile.feature.terminal.R

/** The composer's one-shot alerts: a send problem, a failed rewrite, an attachment that can't go. */
@Composable
internal fun ComposerAlerts(
    sendWarning: Int?,
    commandNotice: CommandNotice?,
    onDismissCommandNotice: () -> Unit,
    rewriteError: String?,
    uploadError: String?,
    onDismissWarning: () -> Unit,
    onDismissRewriteError: () -> Unit,
    onDismissUploadError: () -> Unit
) {
    val ok = stringResource(R.string.composer_ok)
    val (title, message, dismiss) = when {
        sendWarning != null ->
            Triple(
                stringResource(R.string.composer_heads_up),
                stringResource(sendWarning),
                onDismissWarning
            )

        commandNotice is CommandNotice.FillIn ->
            Triple(
                stringResource(R.string.composer_heads_up),
                stringResource(R.string.composer_fill_in, commandNotice.variables),
                onDismissCommandNotice
            )

        commandNotice is CommandNotice.Failed ->
            Triple(
                stringResource(R.string.composer_heads_up),
                commandNotice.error,
                onDismissCommandNotice
            )

        rewriteError != null ->
            Triple(
                stringResource(R.string.composer_rewrite_failed),
                rewriteError,
                onDismissRewriteError
            )

        uploadError != null ->
            Triple(
                stringResource(R.string.composer_could_not_attach),
                uploadError,
                onDismissUploadError
            )

        else -> return
    }
    LpmAlert(
        title = title,
        message = message,
        buttons = listOf(AlertButton(ok, AlertRole.Cancel)),
        onDismissRequest = dismiss
    )
}

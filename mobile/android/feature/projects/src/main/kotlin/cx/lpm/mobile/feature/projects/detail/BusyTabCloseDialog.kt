package cx.lpm.mobile.feature.projects.detail

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import cx.lpm.mobile.core.designsystem.component.AlertButton
import cx.lpm.mobile.core.designsystem.component.AlertRole
import cx.lpm.mobile.core.designsystem.component.LpmConfirmationDialog
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.feature.projects.R

/**
 * Asks before a tab closes on an agent mid-task, as the desktop does: now, or once it
 * is done. [onWait] starts or takes back that wait; null for a Mac that can't wait.
 */
@Composable
internal fun BusyTabCloseDialog(
    term: TerminalInfo,
    busy: Int,
    onCloseNow: () -> Unit,
    onWait: (() -> Unit)?,
    onDismiss: () -> Unit
) {
    val wait = onWait?.let {
        val label = if (term.closesWhenDone) {
            R.string.tab_keep_open
        } else {
            R.string.tab_close_when_done
        }
        AlertButton(stringResource(label), onClick = it)
    }
    LpmConfirmationDialog(
        title = pluralStringResource(
            R.plurals.tab_close_busy_title,
            busy.coerceAtLeast(1),
            busy.coerceAtLeast(1)
        ),
        message = stringResource(
            if (term.closesWhenDone) {
                R.string.tab_close_waiting_message
            } else {
                R.string.tab_close_busy_message
            },
            term.title
        ),
        buttons = listOfNotNull(
            wait,
            AlertButton(
                stringResource(R.string.tab_close_now),
                AlertRole.Destructive,
                onClick = onCloseNow
            ),
            AlertButton(stringResource(R.string.cancel), AlertRole.Cancel)
        ),
        onDismissRequest = onDismiss
    )
}

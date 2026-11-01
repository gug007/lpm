package cx.lpm.mobile.feature.git.history

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ContextMenu
import cx.lpm.mobile.core.designsystem.component.ContextMenuItem
import cx.lpm.mobile.core.designsystem.component.GlassIconButton
import cx.lpm.mobile.feature.git.R

/** The commit's "…": Copy Hash and Copy Message. */
@Composable
internal fun CommitMoreMenu(
    onCopyHash: () -> Unit,
    onCopyMessage: () -> Unit,
    modifier: Modifier = Modifier
) {
    var open by remember { mutableStateOf(false) }
    Box(modifier) {
        GlassIconButton(
            icon = painterResource(DesignR.drawable.ic_more_horiz),
            contentDescription = stringResource(R.string.git_more),
            onClick = { open = true },
            iconSize = 28.dp
        )
        ContextMenu(expanded = open, onDismissRequest = { open = false }) {
            ContextMenuItem(
                title = stringResource(R.string.git_history_copy_hash),
                onClick = onCopyHash,
                icon = painterResource(DesignR.drawable.ic_content_copy)
            )
            ContextMenuItem(
                title = stringResource(R.string.git_history_copy_message),
                onClick = onCopyMessage,
                icon = painterResource(DesignR.drawable.ic_format_quote)
            )
        }
    }
}

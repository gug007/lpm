package cx.lpm.mobile.feature.terminal.composer

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ContextMenu
import cx.lpm.mobile.core.designsystem.component.ContextMenuItem
import cx.lpm.mobile.core.designsystem.component.ContextMenuSubmenu
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.terminal.R

private val DuplicateCopies = 2..10

/**
 * Send, with a long-press menu: save the prompt as a draft, or run it in several
 * duplicates of the project at once (this terminal being the first copy). A prompt
 * that asks for a [video] goes out on a play button in the video accent.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun ComposerSendButton(
    canSend: Boolean,
    menuUseful: Boolean,
    onSend: () -> Unit,
    onSaveDraft: () -> Unit,
    onRunInDuplicates: ((copies: Int) -> Unit)?,
    modifier: Modifier = Modifier,
    onTerminal: Boolean = true,
    video: Boolean = false
) {
    var open by remember { mutableStateOf(false) }
    val colors = LpmTheme.colors
    // White on the dark terminal; the tint on a reply box, as iOS draws each.
    val (ground, glyph) = when {
        onTerminal && canSend -> (if (video) videoAccent else Color.White) to Color.Black

        onTerminal -> Color.White.copy(alpha = 0.12f) to Color.White.copy(alpha = 0.35f)

        canSend -> colors.tint to Color.White

        else ->
            colors.tertiarySystemFill to
                colors.secondaryLabel.copy(alpha = colors.secondaryLabel.alpha * 0.55f)
    }
    Box(modifier) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .combinedClickable(
                    enabled = canSend || menuUseful,
                    role = Role.Button,
                    onLongClick = { open = true },
                    onClick = onSend
                ),
            contentAlignment = Alignment.Center
        ) {
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(CircleShape)
                    .background(ground),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    painterResource(
                        if (video) {
                            DesignR.drawable.ic_play_arrow_fill
                        } else {
                            DesignR.drawable.ic_arrow_upward
                        }
                    ),
                    contentDescription = stringResource(
                        if (video) R.string.video_send else R.string.composer_send
                    ),
                    tint = glyph,
                    modifier = Modifier.size(if (video) 23.dp else 22.dp)
                )
            }
        }
        ContextMenu(expanded = open, onDismissRequest = { open = false }) {
            ContextMenuItem(
                title = stringResource(R.string.composer_save_draft),
                icon = painterResource(DesignR.drawable.ic_move_to_inbox),
                onClick = onSaveDraft
            )
            if (onRunInDuplicates != null) {
                ContextMenuSubmenu(
                    title = stringResource(R.string.composer_run_in_duplicates),
                    icon = painterResource(DesignR.drawable.ic_library_add)
                ) {
                    DuplicateCopies.forEach { copies ->
                        ContextMenuItem(
                            title = pluralStringResource(R.plurals.composer_copies, copies, copies),
                            onClick = { onRunInDuplicates(copies) },
                            enabled = menuUseful
                        )
                    }
                }
            }
        }
    }
}

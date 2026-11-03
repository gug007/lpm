package cx.lpm.mobile.feature.terminal.composer

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ContextMenu
import cx.lpm.mobile.core.designsystem.component.ContextMenuDivider
import cx.lpm.mobile.core.designsystem.component.ContextMenuItem
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.terminal.R

/** What the composer's "+" menu offers; a null action leaves its item out. */
internal class PlusMenuActions(
    val onRewrite: () -> Unit,
    val onPhotoLibrary: () -> Unit,
    val onTakePhoto: (() -> Unit)?,
    val onChooseFiles: () -> Unit,
    val onPasteImage: (() -> Unit)?,
    val onMemory: (() -> Unit)?,
    /** The command editor seeded with what's typed; disabled while nothing is. */
    val onSaveAsCommand: (() -> Unit)? = null,
    val onNewPrompt: () -> Unit,
    val onHistory: () -> Unit,
    val onFind: (() -> Unit)? = null
)

/**
 * The "+" menu: rewrite with AI; photos, camera, files and a copied image; then
 * session memory, save as an lpm command, a new prompt tab, the message history and
 * find in the terminal above. Rewriting with nothing typed explains itself instead.
 */
@Composable
internal fun ComposerPlusMenu(
    actions: PlusMenuActions,
    canRewrite: Boolean,
    enabled: Boolean,
    hasText: Boolean,
    hasClipboardImage: () -> Boolean,
    modifier: Modifier = Modifier
) {
    var open by remember { mutableStateOf(false) }
    var hint by remember { mutableStateOf(false) }
    var pasteImage by remember { mutableStateOf(false) }
    Box(modifier) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clickable(enabled = enabled, role = Role.Button) {
                    pasteImage = actions.onPasteImage != null && hasClipboardImage()
                    open = true
                },
            contentAlignment = Alignment.Center
        ) {
            Icon(
                painterResource(DesignR.drawable.ic_add),
                contentDescription = stringResource(R.string.composer_add),
                tint = if (enabled) LpmTheme.colors.label else LpmTheme.colors.tertiaryLabel,
                modifier = Modifier.size(28.dp)
            )
        }
        ContextMenu(expanded = open, onDismissRequest = { open = false }) {
            ContextMenuItem(
                title = stringResource(R.string.composer_rewrite_with_ai),
                icon = painterResource(DesignR.drawable.ic_auto_awesome),
                onClick = { if (canRewrite) actions.onRewrite() else hint = true }
            )
            ContextMenuDivider()
            ContextMenuItem(
                title = stringResource(R.string.composer_photo_library),
                icon = painterResource(DesignR.drawable.ic_photo_library),
                onClick = actions.onPhotoLibrary
            )
            actions.onTakePhoto?.let {
                ContextMenuItem(
                    title = stringResource(R.string.composer_take_photo),
                    icon = painterResource(DesignR.drawable.ic_photo_camera),
                    onClick = it
                )
            }
            ContextMenuItem(
                title = stringResource(R.string.composer_choose_files),
                icon = painterResource(DesignR.drawable.ic_description),
                onClick = actions.onChooseFiles
            )
            val paste = actions.onPasteImage
            if (pasteImage && paste != null) {
                ContextMenuItem(
                    title = stringResource(R.string.composer_paste_image),
                    icon = painterResource(DesignR.drawable.ic_content_paste),
                    onClick = paste
                )
            }
            ContextMenuDivider()
            actions.onMemory?.let {
                ContextMenuItem(
                    title = stringResource(R.string.composer_memory),
                    icon = painterResource(DesignR.drawable.ic_psychology),
                    onClick = it
                )
            }
            actions.onSaveAsCommand?.let {
                ContextMenuItem(
                    title = stringResource(R.string.composer_save_as_command),
                    icon = painterResource(DesignR.drawable.ic_post_add),
                    onClick = it,
                    enabled = hasText
                )
            }
            ContextMenuItem(
                title = stringResource(R.string.composer_new_prompt),
                icon = painterResource(DesignR.drawable.ic_add_comment),
                onClick = actions.onNewPrompt
            )
            ContextMenuItem(
                title = stringResource(R.string.composer_history),
                icon = painterResource(DesignR.drawable.ic_history),
                onClick = actions.onHistory
            )
            actions.onFind?.let {
                ContextMenuItem(
                    title = stringResource(R.string.composer_find),
                    icon = painterResource(DesignR.drawable.ic_search),
                    onClick = it
                )
            }
        }
        if (hint) {
            RewriteHintPopover(
                text = stringResource(R.string.composer_rewrite_hint),
                onDismiss = { hint = false }
            )
        }
    }
}

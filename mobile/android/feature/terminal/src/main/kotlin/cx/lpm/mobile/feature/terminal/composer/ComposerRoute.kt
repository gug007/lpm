package cx.lpm.mobile.feature.terminal.composer

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.feature.terminal.R
import cx.lpm.mobile.feature.terminal.TerminalSlots

/** The composer under a terminal: its ground, the key bar, and the terminal's own tools. */
@Composable
internal fun ComposerRoute(
    target: ComposerTarget,
    project: Project,
    background: Color,
    slots: TerminalSlots,
    onHideTerminalKeyboard: () -> Unit,
    onPreviewFile: (String) -> Unit,
    modifier: Modifier = Modifier,
    onFind: (() -> Unit)? = null,
    onManageCommands: (() -> Unit)? = null,
    onSaveAsCommand: ((String) -> Unit)? = null
) {
    val duplicates = slots.duplicateSheet
    ComposerHost(
        target = target,
        modifier = modifier,
        mode = ComposerMode(
            look = ComposerLook(
                background = background,
                field = Color.White.copy(alpha = FIELD_ALPHA),
                placeholder = stringResource(R.string.composer_placeholder)
            ),
            onPreviewFile = onPreviewFile,
            onHideTerminalKeyboard = onHideTerminalKeyboard,
            onFind = onFind,
            onManageCommands = onManageCommands,
            onSaveAsCommand = onSaveAsCommand,
            memorySheet = slots.memorySheet,
            duplicateSheet = duplicates?.let { sheet ->
                { prompt, copies, onDuplicated, onDismiss ->
                    sheet(project, prompt, copies, onDuplicated, onDismiss)
                }
            }
        )
    )
}

private const val FIELD_ALPHA = 0.08f

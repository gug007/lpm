package cx.lpm.mobile.feature.terminal.composer

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ActivityIndicatorSize
import cx.lpm.mobile.core.designsystem.component.LinkButton
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.SlashCommand
import cx.lpm.mobile.feature.terminal.R

private const val MENU_ANIMATION_MS = 120

// A phone on its side is short of height, not width: below this the keys share
// the field's row and the terminal keeps two more lines.
private val CompactHeight = 480.dp

/** What the composer's rows do. */
internal class ComposerCallbacks(
    val onFocusChanged: (Boolean) -> Unit,
    val onSend: () -> Unit,
    val onHideKeyboard: () -> Unit,
    val onKey: (String) -> Unit,
    val onSwitchTab: (Int) -> Unit,
    val onCloseTab: (Int) -> Unit,
    val onRetryUpload: (String) -> Unit,
    val onRemoveAttachment: (String) -> Unit,
    val onCancelRewrite: () -> Unit,
    val onPickSlash: (SlashCommand) -> Unit,
    val mentions: MentionActions,
    /** Opens the Commands screen from the `/` menu; null leaves the row out. */
    val onManageCommands: (() -> Unit)? = null
)

/**
 * The terminal input composer: prompt tabs, attachment chips, a multi-line field
 * with "+" and Send (whose long press offers more), over a row of the special keys
 * the soft keyboard can't produce. Its ground is the terminal's, so the two read
 * as one surface. Without the terminal's tools it's a plain reply box: no keys,
 * slash commands or terminal output.
 */
@Composable
internal fun TerminalComposer(
    state: ComposerUiState,
    input: TextFieldState,
    look: ComposerLook,
    focusRequester: FocusRequester,
    callbacks: ComposerCallbacks,
    plusMenu: @Composable () -> Unit,
    sendButton: @Composable () -> Unit,
    dictationStrip: @Composable (Modifier) -> Unit,
    modifier: Modifier = Modifier,
    full: Boolean = false,
    onToggleFull: () -> Unit = {}
) {
    val composer = state.composer
    val compact = with(LocalDensity.current) {
        LocalWindowInfo.current.containerSize.height.toDp()
    } < CompactHeight
    val raise by animateFloatAsState(if (full) 1f else 0f, tween(FULL_MS), label = "full")
    val resting = remember { RestingHeight() }
    Column(
        modifier
            .raisedOverContent(resting) { raise }
            .background(look.background)
            .animateContentSize(tween(MENU_ANIMATION_MS)),
        verticalArrangement = Arrangement.Bottom
    ) {
        when {
            composer.transforming -> {
                RewriteLockBar(onCancel = callbacks.onCancelRewrite)
                ComposerDivider()
            }

            state.slashMatches.isNotEmpty() -> {
                SlashMenu(
                    commands = state.slashMatches,
                    agentLabel = state.agentLabel,
                    onPick = callbacks.onPickSlash,
                    onManage = callbacks.onManageCommands.takeIf { state.lpmCommands },
                    maxHeight = if (compact) 110.dp else 220.dp
                )
                ComposerDivider()
            }

            state.showsMentionMenu -> {
                MentionMenu(
                    state.mentions,
                    callbacks.mentions,
                    includeTerminalOutput = state.terminalTools
                )
                ComposerDivider()
            }
        }
        ComposerTabStrip(
            items = composer.tabStripItems,
            activeIndex = composer.activeIndex,
            onSwitch = callbacks.onSwitchTab,
            onClose = callbacks.onCloseTab
        )
        ComposerAttachments(
            attachments = composer.attachments,
            onRetry = callbacks.onRetryUpload,
            onRemove = callbacks.onRemoveAttachment
        )
        KeysAndInput(
            state,
            input,
            look,
            focusRequester,
            callbacks,
            plusMenu,
            sendButton,
            dictationStrip,
            full,
            onToggleFull,
            if (full) Modifier.weight(1f) else Modifier
        )
    }
}

@Composable
private fun KeysAndInput(
    state: ComposerUiState,
    input: TextFieldState,
    look: ComposerLook,
    focusRequester: FocusRequester,
    callbacks: ComposerCallbacks,
    plusMenu: @Composable () -> Unit,
    sendButton: @Composable () -> Unit,
    dictationStrip: @Composable (Modifier) -> Unit,
    full: Boolean,
    onToggleFull: () -> Unit,
    modifier: Modifier = Modifier
) {
    val heightDp = with(LocalDensity.current) {
        LocalWindowInfo.current.containerSize.height.toDp()
    }
    val keys = @Composable { slot: Modifier ->
        SpecialKeyBar(
            onKey = callbacks.onKey,
            onHideKeyboard = callbacks.onHideKeyboard,
            modifier = slot
        )
    }
    val pill = @Composable { slot: Modifier ->
        ComposerPill(
            input = input,
            state = state,
            look = look,
            focusRequester = focusRequester,
            onFocusChanged = callbacks.onFocusChanged,
            onSend = callbacks.onSend,
            onHideKeyboard = callbacks.onHideKeyboard,
            plusMenu = plusMenu,
            sendButton = sendButton,
            dictationStrip = dictationStrip,
            modifier = slot,
            full = full,
            onToggleFull = onToggleFull
        )
    }
    if (!state.terminalTools) {
        Column(modifier) {
            ComposerDivider()
            pill(if (full) Modifier.weight(1f) else Modifier)
        }
    } else if (heightDp < CompactHeight) {
        Row(modifier, verticalAlignment = Alignment.Bottom) {
            keys(Modifier.weight(1f).padding(bottom = 8.dp))
            pill(Modifier.weight(1f))
        }
    } else {
        Column(modifier) {
            keys(Modifier)
            ComposerDivider()
            pill(if (full) Modifier.weight(1f) else Modifier)
        }
    }
}

@Composable
private fun RewriteLockBar(onCancel: () -> Unit) {
    Row(
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        ActivityIndicator(
            size = ActivityIndicatorSize.Small,
            color = LpmTheme.colors.secondaryLabel
        )
        Text(
            text = stringResource(R.string.composer_rewriting),
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            color = LpmTheme.colors.secondaryLabel
        )
        Spacer(Modifier.weight(1f))
        LinkButton(
            text = stringResource(R.string.composer_cancel),
            onClick = onCancel,
            textStyle = LpmTheme.typography.footnote.copy(fontWeight = FontWeight.SemiBold)
        )
    }
}

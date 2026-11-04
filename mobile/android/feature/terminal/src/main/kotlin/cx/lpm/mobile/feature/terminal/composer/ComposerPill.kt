package cx.lpm.mobile.feature.terminal.composer

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.max
import cx.lpm.mobile.core.data.dictation.plusDictated
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.ui.dictation.DictationMicGap
import cx.lpm.mobile.core.ui.dictation.DictationPreview

private val Corner = 24.dp
private const val EXPAND_MS = 150

// The compact side gutters (44 each: edge inset + a 36 dp control + gap) and the
// field's own text insets; the mic beside Send takes its seat and the gap to Send.
private val CompactChrome = 88.dp + 16.dp
private val ExpandedChrome = 12.dp + 16.dp
private val MicRoom = 36.dp + DictationMicGap
private val SideGutter = 44.dp
private val StripInset = 46.dp
private val StripHeight = 36.dp

// The text keeps clear of the expand button, which appears at the third row.
private val ToggleSpace = 30.dp
private const val TOGGLE_LINES = 3

// The field's own text insets, and the full page's around them.
private val TextTop = 8.dp
private val TextBottom = 9.dp
private val TextSide = 8.dp
private val FullChrome = 4.dp + 40.dp + TextTop + TextBottom

/**
 * The message pill, ChatGPT-style: while the prompt fits one line the controls sit
 * inline (+ · field · send); once it wraps or holds a newline the field spans the
 * pill and the controls drop to a row below it. The field is the same node in both
 * layouts, so the keyboard stays up across the change; only the paddings move.
 */
@Composable
internal fun ComposerPill(
    input: TextFieldState,
    state: ComposerUiState,
    look: ComposerLook,
    focusRequester: FocusRequester,
    onFocusChanged: (Boolean) -> Unit,
    onSend: () -> Unit,
    onHideKeyboard: () -> Unit,
    plusMenu: @Composable () -> Unit,
    sendButton: @Composable () -> Unit,
    dictationStrip: @Composable (Modifier) -> Unit,
    modifier: Modifier = Modifier,
    full: Boolean = false,
    onToggleFull: () -> Unit = {}
) {
    val density = LocalDensity.current
    val measurer = rememberTextMeasurer()
    val style = LpmTheme.typography.body
    var width by remember { mutableIntStateOf(0) }
    var height by remember { mutableIntStateOf(0) }
    val text = input.text.toString()
    val heard = state.dictation.words(state.dictationOwner)
    val shown = if (heard.isEmpty()) text else text.plusDictated(heard)

    // The wrap decision is made at the compact layout's fixed text width, so
    // expanding (which widens the field) can't flip it back at the boundary.
    fun lines(chrome: androidx.compose.ui.unit.Dp): Int {
        val available = width - with(density) { chrome.roundToPx() }
        if (width <= 0 || available <= 0) return 1
        return measurer.measure(
            shown.ifEmpty {
                " "
            },
            style,
            constraints = Constraints(maxWidth = available)
        ).lineCount
    }
    val micBeside = state.micBesideSend(look.enabled)
    val compactChrome = if (micBeside) CompactChrome + MicRoom else CompactChrome
    val stripOverText = state.stripShown && shown.isNotBlank()
    val expanded = full || stripOverText || '\n' in shown || lines(compactChrome) > 1
    val showsToggle = full || (expanded && lines(ExpandedChrome) >= TOGGLE_LINES)
    val toggleSpace = if (showsToggle) ToggleSpace else 0.dp
    // At its five-line cap the field scrolls its own text: a downward swipe there
    // scrolls back rather than closing the keyboard.
    val scrollsText = expanded && lines(ExpandedChrome + toggleSpace) >= MAX_FIELD_LINES
    val start by animateDpAsState(if (expanded) 6.dp else SideGutter, tween(EXPAND_MS), label = "s")
    val end by animateDpAsState(
        when {
            expanded -> 6.dp + toggleSpace
            micBeside -> SideGutter + MicRoom
            else -> SideGutter
        },
        tween(EXPAND_MS),
        label = "e"
    )
    val top by animateDpAsState(if (expanded) 4.dp else 0.dp, tween(EXPAND_MS), label = "top")
    val bottom by animateDpAsState(
        if (expanded) 40.dp else 0.dp,
        tween(EXPAND_MS),
        label = "bottom"
    )
    val controlsBottom = if (expanded) 2.dp else 1.dp
    Box(
        modifier = modifier
            .padding(horizontal = 12.dp, vertical = 8.dp)
            .swipeDownDismissesKeyboard(enabled = !scrollsText, onDismiss = onHideKeyboard)
            .fillMaxWidth()
            .then(if (full) Modifier.fillMaxHeight() else Modifier)
            .onSizeChanged {
                width = it.width
                height = it.height
            }
            .clip(RoundedCornerShape(Corner))
            .background(look.field)
    ) {
        ComposerField(
            input = input,
            placeholder = look.placeholder,
            argumentHint = state.slashArgumentHint,
            enabled = look.enabled && !state.composer.transforming,
            focusRequester = focusRequester,
            onFocusChanged = onFocusChanged,
            onHardwareReturn = onSend,
            modifier = Modifier
                .alpha(if (state.stripShown && (text.isBlank() || heard.isNotEmpty())) 0f else 1f)
                .padding(start = start, end = end, top = top, bottom = bottom)
                .then(if (full) Modifier.fillMaxHeight() else Modifier),
            full = full
        )
        if (heard.isNotEmpty()) {
            val fiveLines = measurer.measure(" ", style).size.height * MAX_FIELD_LINES
            DictationPreview(
                text = shown,
                style = style.copy(color = LpmTheme.colors.label),
                maxHeight = with(density) {
                    max(1.dp, if (full) height.toDp() - FullChrome else fiveLines.toDp())
                },
                modifier = Modifier
                    .padding(start = start, end = end, top = top, bottom = bottom)
                    .padding(
                        start = TextSide,
                        end = TextSide,
                        top = TextTop,
                        bottom = TextBottom
                    )
                    .fillMaxWidth()
            )
        }
        if (showsToggle) {
            FullToggle(
                full = full,
                color = if (state.terminalTools) Color.White else LpmTheme.colors.label,
                onClick = onToggleFull,
                modifier = Modifier.align(Alignment.TopEnd).padding(top = 4.dp, end = 4.dp)
            )
        }
        Box(Modifier.align(Alignment.BottomStart).padding(start = 6.dp, bottom = controlsBottom)) {
            plusMenu()
        }
        Box(Modifier.align(Alignment.BottomEnd).padding(end = 6.dp, bottom = controlsBottom)) {
            sendButton()
        }
        if (state.stripShown) {
            dictationStrip(
                Modifier
                    .align(Alignment.BottomCenter)
                    .padding(start = StripInset, end = StripInset, bottom = controlsBottom)
                    .fillMaxWidth()
                    .height(StripHeight)
            )
        }
        if (state.composer.transforming) ShimmerBorder(Corner, Modifier.matchParentSize())
    }
}

private const val MAX_FIELD_LINES = 5

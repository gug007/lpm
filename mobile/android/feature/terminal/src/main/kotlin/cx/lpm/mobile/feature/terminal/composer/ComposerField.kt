package cx.lpm.mobile.feature.terminal.composer

import android.view.KeyCharacterMap
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.input.TextFieldLineLimits
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.theme.LpmTheme

private const val MAX_LINES = 5

/**
 * The message field: what's typed reaches a shell, so it arrives as typed — no
 * capitals, corrections or suggestions. A hardware keyboard's Return sends and
 * Shift-Return types a newline, as Enter and Shift-Enter do in the desktop's
 * composers; the on-screen Return still starts a new line. After a complete
 * "/command " the command's argument hint shows dimmed past the caret.
 */
@Composable
internal fun ComposerField(
    input: TextFieldState,
    placeholder: String,
    argumentHint: String?,
    enabled: Boolean,
    focusRequester: FocusRequester,
    onFocusChanged: (Boolean) -> Unit,
    onHardwareReturn: () -> Unit,
    modifier: Modifier = Modifier,
    full: Boolean = false
) {
    val colors = LpmTheme.colors
    val style = LpmTheme.typography.body.copy(color = colors.label)
    BasicTextField(
        state = input,
        enabled = enabled,
        textStyle = style,
        cursorBrush = SolidColor(colors.tint),
        lineLimits = TextFieldLineLimits.MultiLine(
            minHeightInLines = 1,
            maxHeightInLines = if (full) Int.MAX_VALUE else MAX_LINES
        ),
        keyboardOptions = KeyboardOptions(
            capitalization = KeyboardCapitalization.None,
            autoCorrectEnabled = false,
            keyboardType = KeyboardType.Text
        ),
        modifier = modifier
            .fillMaxWidth()
            .focusRequester(focusRequester)
            .onFocusChanged { onFocusChanged(it.isFocused) }
            .onPreviewKeyEvent { event ->
                val sends = event.key == Key.Enter && event.isHardware && !event.isShiftPressed
                if (sends &&
                    event.nativeKeyEvent.action == android.view.KeyEvent.ACTION_DOWN
                ) {
                    onHardwareReturn()
                }
                sends
            },
        decorator = { field ->
            Box(Modifier.padding(start = 8.dp, end = 8.dp, top = 8.dp, bottom = 9.dp)) {
                val text = input.text
                if (text.isEmpty()) {
                    Text(
                        text = placeholder,
                        style = style,
                        color = colors.placeholderText,
                        maxLines = 1
                    )
                } else if (argumentHint != null) {
                    Text(
                        text = buildAnnotatedString {
                            withStyle(SpanStyle(color = Color.Transparent)) { append(text) }
                            withStyle(SpanStyle(color = colors.secondaryLabel.copy(alpha = 0.7f))) {
                                append(argumentHint)
                            }
                        },
                        style = style
                    )
                }
                field()
            }
        }
    )
}

/** A key from a physical keyboard, not the on-screen one. */
private val KeyEvent.isHardware: Boolean
    get() = nativeKeyEvent.deviceId != KeyCharacterMap.VIRTUAL_KEYBOARD &&
        nativeKeyEvent.flags and android.view.KeyEvent.FLAG_SOFT_KEYBOARD == 0

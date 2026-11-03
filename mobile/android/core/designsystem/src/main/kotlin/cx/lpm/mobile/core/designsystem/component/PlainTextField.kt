package cx.lpm.mobile.core.designsystem.component

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import cx.lpm.mobile.core.designsystem.theme.LpmTheme

/**
 * SwiftUI's borderless `TextField`: one line of [textStyle] text with a gray
 * [placeholder] while empty, and the tint-colored cursor. [maxLines] above one grows
 * it like `axis: .vertical` with `lineLimit(minLines...maxLines)`.
 */
@Composable
fun PlainTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    textStyle: TextStyle = LpmTheme.typography.body,
    textAlign: TextAlign = TextAlign.Start,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    maxLines: Int = 1,
    minLines: Int = 1,
    textColor: Color = LpmTheme.colors.label
) {
    val colors = LpmTheme.colors
    val style = textStyle.copy(color = textColor, textAlign = textAlign)
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier,
        textStyle = style,
        singleLine = maxLines == 1,
        maxLines = maxLines,
        minLines = minLines,
        cursorBrush = SolidColor(colors.tint),
        keyboardOptions = keyboardOptions,
        keyboardActions = keyboardActions,
        decorationBox = { field ->
            Box {
                if (value.isEmpty()) {
                    // As wide as the field, so a trailing-aligned placeholder sits at its end.
                    Text(
                        text = placeholder,
                        style = style.copy(color = colors.placeholderText),
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                field()
            }
        }
    )
}

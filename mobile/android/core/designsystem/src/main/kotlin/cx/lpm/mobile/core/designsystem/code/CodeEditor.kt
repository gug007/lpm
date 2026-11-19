package cx.lpm.mobile.core.designsystem.code

import android.content.Context
import android.graphics.Typeface
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.inputmethod.BaseInputConnection
import android.widget.EditText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.viewinterop.AndroidView
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import kotlin.math.roundToInt

/** Colors a whole document's syntax, keeping its text as is. */
typealias CodeHighlighter = (String) -> AnnotatedString

/**
 * An editable monospaced code field (iOS `CodeEditorTextView`): no autocorrect, no
 * suggestions, no capitals, the [highlight] colors, and long lines wrapping under their
 * own indentation plus [wrapIndent] columns, so a wrapped YAML value doesn't read as a
 * new key. It's a platform text view because Compose text can't give each line its own
 * hanging indent. [text] replaced from outside (a fresh load) resets it; typing never
 * fights the caret.
 */
@Composable
fun CodeEditor(
    text: String,
    onTextChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    wrapIndent: Int = 2,
    highlight: CodeHighlighter? = null
) {
    val colors = LpmTheme.colors
    val binding = remember { CodeEditorBinding() }
    SideEffect { binding.onEdit = onTextChange }
    AndroidView(
        factory = binding::create,
        modifier = modifier,
        update = { binding.show(text, CodeStyle(highlight, wrapIndent), colors.label, colors.tint) }
    )
}

/** What the editor paints over its text; a new one (a theme switch) restyles it. */
private data class CodeStyle(val highlight: CodeHighlighter?, val wrapIndent: Int)

private class CodeEditorBinding : TextWatcher {
    var onEdit: (String) -> Unit = {}
    private var style = CodeStyle(null, 0)
    private lateinit var view: EditText
    private var replacing = false

    fun create(context: Context): View = EditText(context).apply {
        view = this
        background = null
        typeface = Typeface.MONOSPACE
        setTextSize(TypedValue.COMPLEX_UNIT_SP, FONT_SIZE_SP)
        gravity = Gravity.TOP or Gravity.START
        inputType = InputType.TYPE_CLASS_TEXT or
            InputType.TYPE_TEXT_FLAG_MULTI_LINE or
            InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
        setHorizontallyScrolling(false)
        isVerticalScrollBarEnabled = true
        importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO
        val dp = resources.displayMetrics.density
        setPadding(
            (INSET_X_DP * dp).roundToInt(),
            (INSET_Y_DP * dp).roundToInt(),
            (INSET_X_DP * dp).roundToInt(),
            (INSET_Y_DP * dp).roundToInt()
        )
        addTextChangedListener(this@CodeEditorBinding)
    }

    fun show(text: String, next: CodeStyle, label: Color, tint: Color) {
        view.setTextColor(label.toArgb())
        view.highlightColor = tint.copy(alpha = SELECTION_ALPHA).toArgb()
        val restyled = next != style
        style = next
        if (view.text.toString() != text) {
            replacing = true
            view.setText(text)
            replacing = false
        } else if (!restyled) {
            return
        }
        restyle(view.text)
    }

    override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit

    override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit

    override fun afterTextChanged(s: Editable) {
        if (replacing) return
        onEdit(s.toString())
        // Restyling mid-composition (an IME's marked text) would drop the composing text.
        if (BaseInputConnection.getComposingSpanStart(s) < 0) restyle(s)
    }

    private fun restyle(s: Editable) {
        s.styleCode(
            style.highlight?.invoke(s.toString()),
            view.paint.measureText(" "),
            style.wrapIndent
        )
    }
}

private const val FONT_SIZE_SP = 13f
private const val INSET_X_DP = 16f
private const val INSET_Y_DP = 8f
private const val SELECTION_ALPHA = 0.3f

package cx.lpm.mobile.core.designsystem.code

import android.text.SpannableStringBuilder
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w412dp-h915dp")
class CodeEditorTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun eachLineWrapsUnderItsOwnIndentPlusTwoColumns() {
        val text = SpannableStringBuilder("services:\n  web:\n\n    cmd: x")
        text.styleCode(null, column = 10f, wrapIndent = 2)
        val indents = text.getSpans(0, text.length, WrapIndentSpan::class.java)
            .sortedBy { text.getSpanStart(it) }
            .map { text.getSpanStart(it) to it.rest }
        assertEquals(listOf(0 to 20, 10 to 40, 17 to 20, 18 to 60), indents)

        text.styleCode(null, column = 10f, wrapIndent = 0)
        assertEquals(2, text.getSpans(0, text.length, WrapIndentSpan::class.java).size)
    }

    @Test
    fun theHighlighterColorsReplaceTheLastOnes() {
        val text = SpannableStringBuilder("web: npm")
        val key = Color(0xFF0B7285)
        val colored = buildAnnotatedString {
            withStyle(SpanStyle(color = key)) { append("web") }
            append(": npm")
        }
        text.styleCode(colored, column = 8f, wrapIndent = 2)
        text.styleCode(colored, column = 8f, wrapIndent = 2)
        val spans = text.getSpans(0, text.length, CodeColorSpan::class.java)
        assertEquals(1, spans.size)
        assertEquals(key.toArgb(), spans.single().foregroundColor)
        assertEquals(3, text.getSpanEnd(spans.single()))
    }

    @Test
    fun typingEditsTheTextAndAFreshLoadReplacesIt() {
        var text by mutableStateOf("services:\n")
        var root: View? = null
        compose.setContent {
            root = LocalView.current
            LpmTheme { CodeEditor(text = text, onTextChange = { text = it }) }
        }
        val field = compose.runOnIdle { checkNotNull(root?.findEditText()) }
        compose.runOnIdle {
            assertEquals("services:\n", field.text.toString())
            field.text.append("  web: npm run dev")
        }
        compose.runOnIdle { assertEquals("services:\n  web: npm run dev", text) }

        text = "# All Projects\n"
        compose.runOnIdle {
            assertEquals("# All Projects\n", field.text.toString())
            assertTrue(
                field.inputType and android.text.InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS != 0
            )
        }
    }

    private fun View.findEditText(): EditText? = when (this) {
        is EditText -> this
        is ViewGroup -> (0 until childCount).firstNotNullOfOrNull { getChildAt(it).findEditText() }
        else -> null
    }
}

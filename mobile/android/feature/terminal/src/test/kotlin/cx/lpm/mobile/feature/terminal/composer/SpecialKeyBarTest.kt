package cx.lpm.mobile.feature.terminal.composer

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

// Wide enough that the arrows are on screen without scrolling the bar.
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w900dp-h400dp")
class SpecialKeyBarTest {
    @get:Rule
    val compose = createComposeRule()

    private val sent = mutableListOf<String>()

    private fun show() = compose.setContent {
        LpmTheme(darkTheme = true) {
            SpecialKeyBar(onKey = { sent += it }, onHideKeyboard = {})
        }
    }

    @Test
    fun `every key has a spoken name and Shift Tab sends a back-tab`() {
        show()
        listOf("Escape", "Tab", "Shift Tab", "Control C", "Return").forEach {
            compose.onNodeWithContentDescription(it).performClick()
        }
        assertEquals(
            listOf(
                TerminalKeys.ESCAPE,
                TerminalKeys.TAB,
                "\u001b[Z",
                TerminalKeys.CTRL_C,
                TerminalKeys.RETURN
            ),
            sent
        )
    }

    @Test
    fun `a tap on an arrow sends it once`() {
        show()
        compose.onNodeWithContentDescription("Up").performTouchInput {
            down(center)
            up()
        }
        compose.waitForIdle()
        assertEquals(listOf(TerminalKeys.UP), sent)
    }

    @Test
    fun `a held arrow keeps sending until it is let go`() {
        show()
        compose.mainClock.autoAdvance = false
        compose.onNodeWithContentDescription("Down").performTouchInput { down(center) }
        compose.mainClock.advanceTimeBy(300)
        assertTrue(sent.isEmpty())
        compose.mainClock.advanceTimeBy(500)
        val held = sent.size
        assertTrue("sent $held", held >= 3)
        assertTrue(sent.all { it == TerminalKeys.DOWN })
        compose.onNodeWithContentDescription("Down").performTouchInput { up() }
        compose.mainClock.advanceTimeBy(500)
        assertEquals("letting go sends nothing more", held, sent.size)
    }

    @Test
    fun `a tap after a hold the bar scrolled away still sends`() {
        show()
        compose.mainClock.autoAdvance = false
        compose.onNodeWithContentDescription("Left").performTouchInput { down(center) }
        compose.mainClock.advanceTimeBy(600)
        compose.onNodeWithContentDescription("Left").performTouchInput { cancel() }
        compose.mainClock.advanceTimeBy(300)
        val afterHold = sent.size
        assertTrue("sent $afterHold", afterHold >= 1)
        compose.mainClock.autoAdvance = true
        compose.onNodeWithContentDescription("Left").performClick()
        compose.waitForIdle()
        assertEquals(afterHold + 1, sent.size)
    }
}

package cx.lpm.mobile.feature.actions.button

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.Action
import cx.lpm.mobile.feature.actions.action
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w412dp-h915dp")
class ActionPopupMenuTest {
    @get:Rule
    val compose = createComposeRule()

    private val events = mutableListOf<String>()

    private val stars = action(
        """{"name":"stars","label":"Stars","popup":{"format":"html","width":380,"height":200}}"""
    )
    private val lint = action("""{"name":"lint","label":"Lint"}""")
    private val ship = action(
        """{"name":"ship","label":"Ship","primary":"prod","popup":{"format":"html"},""" +
            """"children":[{"name":"ship:prod","label":"Prod"}]}"""
    )

    private fun show(action: Action, popups: Boolean, edit: Boolean = true) {
        compose.setContent {
            LpmTheme {
                DesktopActionButton(
                    action,
                    ActionCallbacks(
                        run = { events += "run ${it.name}" },
                        edit = if (edit) {
                            { events += "edit ${it.name}" }
                        } else {
                            null
                        },
                        popup = if (popups) {
                            { events += "popup ${it.name}" }
                        } else {
                            null
                        }
                    )
                )
            }
        }
    }

    @Test
    fun aLongPressOffersThePopupFirst() {
        show(stars, popups = true)
        compose.onNodeWithText("Stars").performTouchInput { longClick() }
        val first = compose.onNodeWithText("Show Popup").fetchSemanticsNode().boundsInRoot.top
        val second = compose.onNodeWithText("Edit Action…").fetchSemanticsNode().boundsInRoot.top
        assertTrue("Show Popup comes first", first < second)
        compose.onNodeWithText("Show Popup").performClick()
        assertEquals(listOf("popup stars"), events)
    }

    @Test
    fun withoutEditTheMenuHoldsJustThePopup() {
        show(stars, popups = true, edit = false)
        compose.onNodeWithText("Stars").performTouchInput { longClick() }
        compose.onNodeWithText("Edit Action…").assertDoesNotExist()
        compose.onNodeWithText("Show Popup").performClick()
        assertEquals(listOf("popup stars"), events)
    }

    @Test
    fun aSplitButtonsLongPressShowsItsGroupsPopup() {
        show(ship, popups = true, edit = false)
        compose.onNodeWithText("Prod").performTouchInput { longClick() }
        compose.onNodeWithText("Show Popup").performClick()
        assertEquals(listOf("popup ship"), events)
    }

    @Test
    fun noPopupWithoutTheMacsFeatureOrTheActionsPopup() {
        show(lint, popups = true)
        compose.onNodeWithText("Lint").performTouchInput { longClick() }
        compose.onNodeWithText("Edit Action…").assertExists()
        compose.onNodeWithText("Show Popup").assertDoesNotExist()
    }

    @Test
    fun anOlderMacOffersNoPopup() {
        show(stars, popups = false, edit = false)
        compose.onNodeWithText("Stars").performTouchInput { longClick() }
        assertEquals(0, compose.onAllNodesWithText("Show Popup").fetchSemanticsNodes().size)
        assertTrue("events: $events", "popup stars" !in events)
    }
}

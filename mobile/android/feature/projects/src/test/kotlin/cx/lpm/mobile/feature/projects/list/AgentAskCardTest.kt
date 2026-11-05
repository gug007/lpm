package cx.lpm.mobile.feature.projects.list

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.AgentDialog
import cx.lpm.mobile.core.model.AgentDialogOption
import cx.lpm.mobile.core.model.AgentDialogRead
import cx.lpm.mobile.core.model.AgentState
import cx.lpm.mobile.core.model.ProjectAgentRow
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class AgentAskCardTest {
    @get:Rule
    val compose = createComposeRule()

    private val events = mutableListOf<String>()

    private val dialog = AgentDialog(
        id = "d-1",
        question = "Run npm test?",
        details = listOf("npm test", "in api/", "a third line the card leaves out"),
        options = listOf(
            AgentDialogOption("1", "Yes", "Run it once", typed = false),
            AgentDialogOption("2", "No", "", typed = false),
            AgentDialogOption("3", "Type something.", "", typed = true)
        )
    )
    private val read = AgentDialogRead("api", "t-1", "claude_code_t-1", 42, dialog)

    private fun show(ask: AgentAsk) = compose.setContent {
        LpmTheme {
            AgentAskCard(
                ask = ask,
                onPick = { events += "pick ${it.key}" },
                onOpen = { events += "open" }
            )
        }
    }

    @Test
    fun theQuestionItsDetailsAndEveryOptionShow() {
        show(AgentAsk(read))
        compose.onNodeWithText("Run npm test?").assertExists()
        compose.onNodeWithText("npm test").assertExists()
        compose.onNodeWithText("in api/").assertExists()
        compose.onNodeWithText("a third line the card leaves out").assertDoesNotExist()
        compose.onNodeWithContentDescription("Option 1: Yes").assertIsEnabled().performClick()
        compose.onNodeWithContentDescription("Option 2: No").performClick()
        assertEquals(listOf("pick 1", "pick 2"), events)
    }

    @Test
    fun aTypedOptionAlsoOpensTheTab() {
        show(AgentAsk(read))
        compose.onNodeWithContentDescription("Option 3: Type something.").performClick()
        assertEquals(listOf("pick 3", "open"), events)
    }

    @Test
    fun aPickOnItsWayHoldsTheOthers() {
        show(AgentAsk(read, picking = "1"))
        compose.onNodeWithContentDescription("Option 2: No").assertIsNotEnabled()
        compose.onNodeWithText("Sent").assertDoesNotExist()
    }

    @Test
    fun aPickThatWentThroughSaysSent() {
        show(AgentAsk(read, answered = true))
        compose.onNodeWithText("Sent").assertExists()
        compose.onNodeWithContentDescription("Option 1: Yes").assertIsNotEnabled()
    }

    @Test
    fun aRefusedPickSaysWhy() {
        show(AgentAsk(read, error = "This prompt was already answered."))
        compose.onNodeWithText("This prompt was already answered.").assertExists()
        compose.onNodeWithContentDescription("Option 1: Yes").assertIsEnabled()
    }

    @Test
    fun theDeckAsksForAWaitingRowsQuestionAndShowsItUnderTheRow() {
        val row = ProjectAgentRow(
            id = "claude_code_t-1",
            state = AgentState.NeedsYou,
            title = "Claude",
            provider = "Claude",
            terminalId = "t-1",
            since = 1L,
            until = null
        )
        var asks by mutableStateOf(emptyMap<String, AgentAsk>())
        compose.setContent {
            LpmTheme {
                ProjectTerminalDeck(
                    rows = listOf(row),
                    edgeRows = AgentEdgeRows(),
                    edgeKey = "p:api",
                    onOpen = { events += "open ${it.terminalId}" },
                    asking = DeckAsking(
                        asks = asks,
                        follow = { r, terminal -> events += "follow $terminal ${r.id}" },
                        pick = { _, option -> events += "pick ${option.key}" }
                    )
                )
            }
        }
        compose.waitForIdle()
        assertEquals(listOf("follow t-1 claude_code_t-1"), events)
        compose.onNodeWithText("Run npm test?").assertDoesNotExist()

        asks = mapOf(row.id to AgentAsk(read))
        compose.onNodeWithContentDescription("Option 3: Type something.").performClick()
        assertEquals(
            listOf("follow t-1 claude_code_t-1", "pick 3", "open t-1"),
            events
        )
    }
}

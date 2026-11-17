package cx.lpm.mobile.feature.projects.list

import androidx.compose.foundation.layout.width
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.AgentDialog
import cx.lpm.mobile.core.model.AgentDialogOption
import cx.lpm.mobile.core.model.AgentDialogRead
import cx.lpm.mobile.core.model.AgentState
import cx.lpm.mobile.core.model.ProjectAgentRow
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
class AgentAskCardTest {
    @get:Rule
    val compose = createComposeRule()

    private val events = mutableListOf<String>()

    private val dialog = AgentDialog(
        id = "d-1",
        question = "Run npm test?",
        details = listOf("Bash command", "Run the test suite", "npm test -- --runInBand"),
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
        compose.onNodeWithText("Bash command").assertExists()
        compose.onNodeWithText("Run the test suite").assertExists()
        compose.onNodeWithText("npm test -- --runInBand").assertExists()
        compose.onNodeWithContentDescription("Option 1: Yes").assertIsEnabled().performClick()
        compose.onNodeWithContentDescription("Option 2: No").performClick()
        assertEquals(listOf("pick 1", "pick 2"), events)
    }

    private fun SemanticsNodeInteraction.clipped(): Boolean {
        val layouts = mutableListOf<TextLayoutResult>()
        fetchSemanticsNode().config[SemanticsActions.GetTextLayoutResult].action?.invoke(layouts)
        return layouts.single().hasVisualOverflow
    }

    // Real text layout, so a clipped line is measured as clipped.
    @Test
    @GraphicsMode(GraphicsMode.Mode.NATIVE)
    fun aClippedDetailOpensOnTapAgainAfterTheQuestionChanges() {
        val long = "npm run db:migrate -- --env production --tenant acme --dry-run=false " +
            "--verbose --lock-timeout 30s --schema public --target latest --seed none"
        var ask by mutableStateOf(AgentAsk(read.copy(dialog = dialog.copy(details = listOf(long)))))
        compose.setContent {
            LpmTheme {
                AgentAskCard(ask = ask, onPick = {}, onOpen = {}, modifier = Modifier.width(200.dp))
            }
        }
        val detail = compose.onNodeWithText(long)
        assertTrue(detail.clipped())
        detail.performClick()
        assertFalse(detail.clipped())

        ask = AgentAsk(read.copy(dialog = dialog.copy(id = "d-2", details = listOf(long))))
        compose.waitForIdle()
        assertTrue(detail.clipped())
        detail.performClick()
        assertFalse(detail.clipped())
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

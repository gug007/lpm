package cx.lpm.mobile.feature.terminal.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import cx.lpm.mobile.core.data.conversation.ConversationDetail
import cx.lpm.mobile.core.data.conversation.PendingPrompt
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.ConversationItem
import cx.lpm.mobile.core.model.ConversationItem.Kind
import cx.lpm.mobile.core.model.ConversationPart
import cx.lpm.mobile.core.model.ConversationRow
import cx.lpm.mobile.core.model.ConversationTool
import cx.lpm.mobile.core.model.ConversationTool.State
import cx.lpm.mobile.feature.terminal.ControlHandoffBar
import cx.lpm.mobile.feature.terminal.conversation.ConversationActions
import cx.lpm.mobile.feature.terminal.conversation.ConversationScreen
import cx.lpm.mobile.feature.terminal.conversation.ConversationUiState
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ConversationUiTest {
    @get:Rule
    val compose = createComposeRule()

    private val events = mutableListOf<String>()
    private val details = mutableStateMapOf<String, ConversationDetail>()

    private fun show(content: @Composable () -> Unit) =
        compose.setContent { LpmTheme(darkTheme = true) { content() } }

    private fun show(state: ConversationUiState) = show {
        ConversationScreen(
            state = state,
            background = Color.Black,
            actions = ConversationActions(
                onLoadEarlier = { events += "earlier" },
                onLoadDetail = {
                    events += "detail ${it.id}"
                    details[it.id] = ConversationDetail.Parts(
                        listOf(ConversationPart("Output", ConversationPart.Style.Code, "all good"))
                    )
                },
                detail = { details[it.id] },
                onOpenPath = { events += "open $it" }
            )
        )
    }

    private fun items(vararg items: ConversationItem) =
        ConversationUiState(rows = ConversationRow.rows(items.toList()), loaded = true)

    private fun tool(
        id: String,
        what: String,
        verb: String,
        subject: String,
        path: String = "",
        changes: Pair<Int, Int>? = null
    ) = ConversationItem(
        id,
        Kind.Tool(
            ConversationTool(
                what, verb, subject, true, path, changes?.first, changes?.second, "", State.Done
            )
        )
    )

    @Test
    fun `every entry has its row and reads fold into one`() {
        show(
            items(
                ConversationItem("a", Kind.Prompt("Fix the badge", images = 2)),
                ConversationItem("b", Kind.Text("Looking into it")),
                tool("r1", "read", "Read", "a.ts"),
                tool("r2", "read", "Read", "b.ts"),
                tool("s1", "search", "Searched", "badge"),
                tool("e1", "edit", "Edited", "a.ts", "/p/a.ts", changes = 9 to 3),
                ConversationItem("n", Kind.Notice("Interrupted"))
            )
        )
        compose.onNodeWithText("Fix the badge").assertExists()
        compose.onNodeWithText("2 images").assertExists()
        compose.onNodeWithText("Looking into it").assertExists()
        compose.onNodeWithContentDescription("Read 2 files, searched once").performClick()
        compose.onNodeWithContentDescription("Read b.ts").assertExists()
        compose.onNodeWithContentDescription("Edited a.ts, 9 added, 3 removed").assertExists()
        compose.onNodeWithText("Interrupted").assertExists()
    }

    @Test
    fun `a step opens to what it did and its file`() {
        show(items(tool("e1", "edit", "Edited", "a.ts", "/p/a.ts")))
        compose.onNodeWithContentDescription("Edited a.ts").performClick()
        compose.onNodeWithText("all good").assertExists()
        compose.onNodeWithText("Open File").performClick()
        assertEquals(listOf("detail e1", "open /p/a.ts"), events)
        compose.onNodeWithContentDescription("Edited a.ts").performClick()
        compose.onNodeWithText("all good").assertDoesNotExist()
    }

    @Test
    fun `a prompt on its way shows until the transcript has it`() {
        var state by mutableStateOf(
            items().copy(sending = listOf(PendingPrompt("s1", "ship it")))
        )
        show {
            ConversationScreen(state, Color.Black, ConversationActions())
        }
        compose.onNodeWithText("ship it").assertExists()
        compose.onNodeWithText("Sending…").assertExists()
        state = items(ConversationItem("a", Kind.Prompt("ship it", 0)))
        compose.onNodeWithText("ship it").assertExists()
        compose.onNodeWithText("Sending…").assertDoesNotExist()
    }

    @Test
    fun `earlier entries are asked for`() {
        show(items(ConversationItem("b", Kind.Text("hi"))).copy(more = true))
        compose.onNodeWithText("Show Earlier").performClick()
        assertEquals(listOf("earlier"), events)
    }

    @Test
    fun `an empty conversation and one that can't be read say so`() {
        var state by mutableStateOf(ConversationUiState(loaded = true))
        show { ConversationScreen(state, Color.Black, ConversationActions()) }
        compose.onNodeWithText("No Conversation Yet").assertExists()
        state = ConversationUiState(error = "No such project")
        compose.onNodeWithText("Couldn't Load the Conversation").assertExists()
        compose.onNodeWithText("No such project").assertExists()
    }

    @Test
    fun `a conversation driven elsewhere offers control instead of the composer`() {
        show { ControlHandoffBar("Studio Mac", Color.Black, onTakeControl = { events += "take" }) }
        compose.onNodeWithText("Active on Studio Mac").assertExists()
        compose.onNodeWithText("Take control").performClick()
        assertEquals(listOf("take"), events)
    }
}

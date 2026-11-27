package cx.lpm.mobile.feature.projects.list

import androidx.compose.foundation.layout.Box
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.AgentPause
import cx.lpm.mobile.core.model.AgentState
import cx.lpm.mobile.core.model.ProjectAgentRow
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class AgentRowMenuTest {
    @get:Rule
    val compose = createComposeRule()

    private val events = mutableListOf<String>()

    private val working = ProjectAgentRow(
        id = "claude_code_t1",
        state = AgentState.Working,
        title = "Fix tax",
        provider = "Claude Code",
        terminalId = "t1",
        since = 100,
        until = null,
        keys = listOf("claude_code_t1")
    )
    private val paused = working.copy(pause = AgentPause(1_500, listOf("Run the test suite")))

    private fun actions(archives: Boolean = true, finishes: Boolean = true) = AgentRowActions(
        archive = if (archives) {
            { events += "archive" }
        } else {
            null
        },
        finishPaused = if (finishes) {
            { events += "finish ${it.keys}" }
        } else {
            null
        }
    )

    private fun show(row: ProjectAgentRow, actions: AgentRowActions) = compose.setContent {
        LpmTheme {
            Box {
                AgentRowMenu(
                    expanded = true,
                    onDismiss = {},
                    row = row,
                    onOpen = { events += "open" },
                    actions = actions
                )
            }
        }
    }

    @Test
    fun aPausedAgentMarksItselfFinished() {
        show(paused, actions())
        compose.onNodeWithText("Open").assertExists()
        compose.onNodeWithText("Archive").assertDoesNotExist()
        compose.onNodeWithText("Mark as finished").performClick()
        assertEquals(listOf("finish [claude_code_t1]"), events)
    }

    @Test
    fun aWorkingAgentHasNothingToMarkFinished() {
        show(working, actions())
        compose.onNodeWithText("Open").assertExists()
        compose.onNodeWithText("Mark as finished").assertDoesNotExist()
    }

    @Test
    fun aMacWithoutFinishPausedOffersNoMarkAsFinished() {
        show(paused, actions(finishes = false))
        compose.onNodeWithText("Mark as finished").assertDoesNotExist()
    }

    @Test
    fun aMacThatOnlyFinishesPausedAgentsOffersAMenuOnlyOnPausedRows() {
        val onlyFinishing = actions(archives = false)
        assertTrue(onlyFinishing.hasMenu(paused))
        assertFalse(onlyFinishing.hasMenu(working))
        assertFalse(onlyFinishing.hasMenu(working.copy(state = AgentState.Done, until = 400)))
        assertFalse(actions(archives = false, finishes = false).hasMenu(paused))
        assertTrue(actions(finishes = false).hasMenu(working))
    }

    @Test
    fun aMacThatOnlyFinishesPausedAgentsNeverOffersArchive() {
        show(working.copy(state = AgentState.Done, until = 400), actions(archives = false))
        compose.onNodeWithText("Archive").assertDoesNotExist()
    }
}

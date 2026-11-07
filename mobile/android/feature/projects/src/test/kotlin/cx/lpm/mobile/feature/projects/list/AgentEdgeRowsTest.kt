package cx.lpm.mobile.feature.projects.list

import cx.lpm.mobile.core.model.AgentState
import cx.lpm.mobile.core.model.ProjectAgentRow
import org.junit.Assert.assertEquals
import org.junit.Test

class AgentEdgeRowsTest {
    private fun rows(vararg placed: Pair<List<AgentState>, Float>) = AgentEdgeRows().apply {
        placed.forEachIndexed { index, (states, middle) ->
            setStates("row$index", states)
            placeAt("row$index", middle)
        }
    }

    private val working = listOf(AgentState.Working)

    private val row = ProjectAgentRow(
        id = "a",
        state = AgentState.Error,
        title = "Fix flaky snapshot test",
        provider = "Claude Code",
        terminalId = "t1",
        since = null,
        until = null,
        shared = listOf(AgentState.Done, AgentState.Working)
    )

    @Test
    fun `a row speaks for every agent on its tab still going or waiting on someone`() {
        assertEquals(listOf(AgentState.Error, AgentState.Working), row.edgeStates)
        assertEquals(
            emptyList<AgentState>(),
            row.copy(state = AgentState.Done, shared = listOf(AgentState.Idle)).edgeStates
        )
    }

    @Test
    fun `a row already looked at says nothing, however it ended`() {
        assertEquals(emptyList<AgentState>(), row.copy(seenAt = 1).edgeStates)
    }

    @Test
    fun `an agent on screen says nothing`() {
        val rows = rows(working to 300f)
        assertEquals(AgentsOutOfView(), rows.outOfView(scroll = 100, viewport = 400))
    }

    @Test
    fun `agents sort to the end they went past`() {
        val rows = rows(working to 50f, listOf(AgentState.Error) to 900f)
        assertEquals(
            AgentsOutOfView(working, listOf(AgentState.Error)),
            rows.outOfView(scroll = 100, viewport = 400)
        )
    }

    @Test
    fun `every agent past an end counts, most urgent first`() {
        val rows = rows(
            working to 10f,
            listOf(AgentState.Working, AgentState.NeedsYou) to 20f,
            listOf(AgentState.Error) to 30f
        )
        assertEquals(
            listOf(AgentState.NeedsYou, AgentState.Error, AgentState.Working, AgentState.Working),
            rows.outOfView(scroll = 100, viewport = 400).above
        )
    }

    @Test
    fun `a row stays counted until less than half of it shows`() {
        val rows = rows(working to 100f)
        assertEquals(emptyList<AgentState>(), rows.outOfView(scroll = 100, viewport = 400).above)
        assertEquals(working, rows.outOfView(scroll = 101, viewport = 400).above)
    }

    @Test
    fun `rows with nothing to say and rows not yet placed are skipped`() {
        val rows = rows(emptyList<AgentState>() to 10f)
        rows.setStates("unplaced", working)
        assertEquals(AgentsOutOfView(), rows.outOfView(scroll = 100, viewport = 400))
    }

    @Test
    fun `a row taken out of the list stops counting`() {
        val rows = rows(working to 10f)
        rows.remove("row0")
        assertEquals(AgentsOutOfView(), rows.outOfView(scroll = 100, viewport = 400))
    }

    @Test
    fun `a state change counts without the row moving`() {
        val rows = rows(working to 10f)
        rows.setStates("row0", listOf(AgentState.NeedsYou))
        assertEquals(
            listOf(AgentState.NeedsYou),
            rows.outOfView(scroll = 100, viewport = 400).above
        )
    }
}

package cx.lpm.mobile.feature.projects.list

import cx.lpm.mobile.core.model.AgentState
import cx.lpm.mobile.core.model.ProjectAgentRow
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AgentEdgeRowsTest {
    private fun rows(vararg placed: Pair<AgentState?, Float>) = AgentEdgeRows().apply {
        placed.forEachIndexed { index, (state, middle) ->
            setState("row$index", state)
            placeAt("row$index", middle)
        }
    }

    @Test
    fun `only agents still going or waiting on someone speak up`() {
        assertNull(edgeState(listOf(AgentState.Done, AgentState.Idle)))
        assertEquals(AgentState.Working, edgeState(listOf(AgentState.Done, AgentState.Working)))
    }

    @Test
    fun `the most urgent agent speaks for an end`() {
        assertEquals(
            AgentState.NeedsYou,
            edgeState(listOf(AgentState.Working, AgentState.Error, AgentState.NeedsYou))
        )
        assertEquals(AgentState.Error, edgeState(listOf(AgentState.Working, AgentState.Error)))
    }

    @Test
    fun `a row already looked at says nothing, however it ended`() {
        val row = ProjectAgentRow(
            id = "a",
            state = AgentState.Error,
            title = "Fix flaky snapshot test",
            provider = "Claude Code",
            terminalId = "t1",
            since = null,
            until = null
        )
        assertEquals(AgentState.Error, row.edgeState)
        assertNull(row.copy(seenAt = 1).edgeState)
    }

    @Test
    fun `an agent on screen says nothing`() {
        val rows = rows(AgentState.Working to 300f)
        assertEquals(AgentsOutOfView(), rows.outOfView(scroll = 100, viewport = 400))
    }

    @Test
    fun `agents sort to the end they went past`() {
        val rows = rows(AgentState.Working to 50f, AgentState.Error to 900f)
        assertEquals(
            AgentsOutOfView(AgentState.Working, AgentState.Error),
            rows.outOfView(scroll = 100, viewport = 400)
        )
    }

    @Test
    fun `a row stays counted until less than half of it shows`() {
        val rows = rows(AgentState.Working to 100f)
        assertNull(rows.outOfView(scroll = 100, viewport = 400).above)
        assertEquals(AgentState.Working, rows.outOfView(scroll = 101, viewport = 400).above)
    }

    @Test
    fun `rows with nothing to say and rows not yet placed are skipped`() {
        val rows = rows(null to 10f)
        rows.setState("unplaced", AgentState.Working)
        assertEquals(AgentsOutOfView(), rows.outOfView(scroll = 100, viewport = 400))
    }

    @Test
    fun `a row taken out of the list stops counting`() {
        val rows = rows(AgentState.Working to 10f)
        rows.remove("row0")
        assertEquals(AgentsOutOfView(), rows.outOfView(scroll = 100, viewport = 400))
    }

    @Test
    fun `a state change counts without the row moving`() {
        val rows = rows(AgentState.Working to 10f)
        rows.setState("row0", AgentState.NeedsYou)
        assertEquals(AgentState.NeedsYou, rows.outOfView(scroll = 100, viewport = 400).above)
    }
}

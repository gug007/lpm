package cx.lpm.mobile.core.model

import cx.lpm.mobile.core.model.ConversationItem.Kind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ConversationRowTest {
    private fun call(
        id: String,
        what: String,
        state: ConversationTool.State = ConversationTool.State.Done
    ) = ConversationItem(
        id,
        Kind.Tool(ConversationTool(what, "Did", id, true, "", null, null, "", state))
    )

    private fun text(id: String) = ConversationItem(id, Kind.Text(id))

    @Test
    fun `a run of reads and searches is one row`() {
        val rows = ConversationRow.rows(
            listOf(
                text("a"),
                call("r1", "read"),
                call("s1", "search"),
                call("r2", "read"),
                call("e1", "edit"),
                call("r3", "read"),
                text("b")
            )
        )
        assertEquals(listOf("a", "lookups:r1", "e1", "r3", "b"), rows.map { it.id })
        val run = rows[1] as ConversationRow.Lookups
        assertEquals(2, run.reads)
        assertEquals(1, run.searches)
        assertNull(run.running)
    }

    @Test
    fun `a run going on says what its last call is at`() {
        val run = ConversationRow.rows(
            listOf(
                call("r1", "read", ConversationTool.State.Failed),
                call("r2", "read", ConversationTool.State.Running)
            )
        ).single() as ConversationRow.Lookups
        assertEquals("r2", run.running?.subject)
        assertTrue(run.failed)
    }

    @Test
    fun `the view is the terminal unless the conversation was picked`() {
        assertEquals(TerminalViewMode.Terminal, TerminalViewMode.of(null))
        assertEquals(TerminalViewMode.Terminal, TerminalViewMode.of("other"))
        assertEquals(TerminalViewMode.Conversation, TerminalViewMode.of("conversation"))
    }
}

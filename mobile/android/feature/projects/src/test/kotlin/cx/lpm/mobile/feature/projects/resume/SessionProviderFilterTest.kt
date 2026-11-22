package cx.lpm.mobile.feature.projects.resume

import org.junit.Assert.assertEquals
import org.junit.Test

class SessionProviderFilterTest {
    @Test
    fun `Claude and Codex are always offered, as the list always has`() {
        assertEquals(listOf("claude", "codex"), sessionFilterProviders(emptyList(), null))
        assertEquals(listOf("claude", "codex"), sessionFilterProviders(listOf("codex"), null))
    }

    @Test
    fun `other agents with sessions follow in the desktop's order`() {
        assertEquals(
            listOf("claude", "codex", "gemini", "cursor"),
            sessionFilterProviders(listOf("cursor", "claude", "gemini", "cursor"), null)
        )
    }

    @Test
    fun `the picked agent stays even when a search leaves it nothing`() {
        assertEquals(
            listOf("claude", "codex", "opencode"),
            sessionFilterProviders(emptyList(), "opencode")
        )
    }

    @Test
    fun `an agent this phone doesn't know is offered by its own name, last`() {
        assertEquals(
            listOf("claude", "codex", "gemini", "aider"),
            sessionFilterProviders(listOf("aider", "gemini"), null)
        )
    }
}

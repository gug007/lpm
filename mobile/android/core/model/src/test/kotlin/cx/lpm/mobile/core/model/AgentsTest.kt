package cx.lpm.mobile.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AgentsTest {
    private val now = 1_000_000L

    private fun entry(
        key: String,
        value: String,
        timestamp: Long,
        pane: String = "",
        turnStart: Long = 0,
        endedAt: Long = 0
    ) = StatusEntry(key, value, 0, timestamp, pane, turnStart, endedAt)

    private fun seen(key: String, value: String, pane: String, seenAt: Long) =
        StatusEntry(key, value, 0, seenAt - 10_000, pane, seenAt - 70_000, seenAt - 10_000, seenAt)

    private fun project(vararg entries: StatusEntry) = Project(
        name = "storefront", label = "storefront", running = true, isRemote = false,
        parentName = "", worktree = false, workStatus = null, autoPull = null,
        claude = ClaudeOwnChoice(), statusEntries = entries.toList(), services = emptyList(),
        allServices = emptyList(), profiles = emptyList(), activeProfile = "",
        actions = emptyList(), zones = emptyList(), configError = null
    )

    @Test
    fun `the four reported states map to product words, anything else is idle`() {
        assertEquals(AgentState.NeedsYou, AgentState.of("Waiting"))
        assertEquals(AgentState.Error, AgentState.of("Error"))
        assertEquals(AgentState.Working, AgentState.of("Running"))
        assertEquals(AgentState.Done, AgentState.of("Done"))
        assertEquals(AgentState.Idle, AgentState.of("Thinking"))
        assertEquals("Needs you", AgentState.NeedsYou.label)
    }

    @Test
    fun `rows come most urgent first and one per tab`() {
        val rows = projectAgentRows(
            project(
                entry("claude_code_a", "Running", 900_000, pane = "t1", turnStart = 800_000),
                entry("codex_b", "Waiting", 950_000, pane = "t2"),
                entry(
                    "gemini_c",
                    "Done",
                    990_000,
                    pane = "t1",
                    turnStart = 700_000,
                    endedAt = 760_000
                ),
                entry("cursor_d", "Error", 970_000)
            ),
            now,
            mapOf("t1" to "Terminal 1")
        )
        assertEquals(listOf("codex_b", "cursor_d", "claude_code_a"), rows.map { it.id })
        val working = rows.last()
        assertEquals("Terminal 1", working.title)
        assertEquals("Claude Code", working.provider)
        assertEquals(1, working.shared)
        assertEquals(800_000L, working.since)
        assertNull(working.until)
        val waiting = rows.first()
        assertEquals("Codex", waiting.title)
        assertEquals(950_000L, waiting.since)
        assertNull(rows[1].terminalId)
    }

    @Test
    fun `a finished turn holds at how long it took`() {
        val done = projectAgentRows(
            project(
                entry(
                    "claude_code_a",
                    "Done",
                    990_000,
                    pane = "t1",
                    turnStart = 700_000,
                    endedAt = 760_000
                )
            ),
            now,
            emptyMap()
        ).single()
        assertEquals("1m", done.elapsed(now + 600_000))
    }

    @Test
    fun `a stamp from a clock running ahead counts from now`() {
        val row = projectAgentRows(
            project(entry("x", "Waiting", now + 60_000)),
            now,
            emptyMap()
        ).single()
        assertEquals(now, row.since)
        assertEquals("Agent", row.provider)
    }

    @Test
    fun `seen agents follow the others, most recently seen first`() {
        val p = project(entry("claude_code_a", "Running", 900_000, pane = "t1")).copy(
            seenEntries = listOf(
                seen("codex_b", "Done", pane = "t2", seenAt = 900_000),
                seen("cursor_c", "Error", pane = "t3", seenAt = 950_000),
                seen("gemini_d", "Done", pane = "t1", seenAt = 990_000)
            )
        )
        val rows = projectAgentList(p, now, mapOf("t2" to "Fix tests"))
        assertEquals(listOf("claude_code_a", "cursor_c", "codex_b"), rows.map { it.id })
        assertEquals(listOf(false, true, true), rows.map { it.seen })
        assertEquals(listOf("claude_code_a", "gemini_d"), rows.first().keys)
        assertEquals(0, rows.first().shared)
        val done = rows.last()
        assertEquals("Fix tests", done.title)
        assertEquals(listOf("codex_b"), done.keys)
        assertEquals(900_000L, done.seenAt)
        assertEquals(830_000L to 890_000L, done.since to done.until)
        assertEquals(listOf("claude_code_a"), projectAgentRows(p, now, emptyMap()).map { it.id })
    }

    @Test
    fun `seen agents on one tab are one row holding every key`() {
        val p = project().copy(
            seenEntries = listOf(
                seen("codex_b", "Done", pane = "t2", seenAt = 900_000),
                seen("claude_code_c", "Done", pane = "t2", seenAt = 950_000),
                seen("omp_d", "Done", pane = "", seenAt = 920_000)
            )
        )
        val rows = projectAgentList(p, now, emptyMap())
        assertEquals(listOf("claude_code_c", "omp_d"), rows.map { it.id })
        val tab = rows.first()
        assertEquals(1, tab.shared)
        assertEquals(setOf("claude_code_c", "codex_b"), tab.keys.toSet())
        assertEquals(950_000L, tab.seenAt)
        assertNull(rows.last().terminalId)
    }

    @Test
    fun `an archive waiting on its undo hides finished agents, not a new turn`() {
        val p = project(
            entry("claude_code_a", "Running", 900_000, pane = "t1"),
            entry("codex_b", "Done", 900_000, pane = "t2")
        ).copy(seenEntries = listOf(seen("cursor_c", "Error", pane = "t3", seenAt = 950_000)))
        val hiding = setOf("claude_code_a", "codex_b", "cursor_c")
        assertEquals(
            listOf("claude_code_a"),
            projectAgentList(p, now, emptyMap(), hiding).map {
                it.id
            }
        )
    }

    @Test
    fun `seen rows past the limit fold into one line`() {
        val p = project(entry("claude_code_a", "Waiting", 900_000, pane = "t1")).copy(
            seenEntries = (1..4).map {
                seen(
                    "codex_$it",
                    "Done",
                    pane = "s$it",
                    seenAt =
                        900_000L + it
                )
            }
        )
        val rows = projectAgentList(p, now, emptyMap())
        val folded = foldSeenAgents(rows, shown = 3, expanded = false)
        assertEquals(
            listOf("claude_code_a", "codex_4", "codex_3", "codex_2"),
            folded.rows.map {
                it.id
            }
        )
        assertEquals(1, folded.folded)
        assertEquals(FoldedAgents(rows, 1), foldSeenAgents(rows, shown = 3, expanded = true))
        assertEquals(FoldedAgents(rows, 0), foldSeenAgents(rows, shown = 4, expanded = false))
        assertEquals(4, foldSeenAgents(rows, shown = 0, expanded = false).folded)
    }

    @Test
    fun `only a finished turn can be seen and archived`() {
        assertEquals(
            listOf(AgentState.Error, AgentState.Done),
            AgentState.entries.filter { it.isFinished }
        )
    }

    @Test
    fun `durations read like a stopwatch, rounded down`() {
        assertEquals("0s", shortDuration(-5))
        assertEquals("45s", shortDuration(45_999))
        assertEquals("4m", shortDuration(4 * 60_000 + 59_000))
        assertEquals("2h", shortDuration(2 * 3_600_000L))
        assertEquals("2h 5m", shortDuration(2 * 3_600_000L + 5 * 60_000))
    }

    @Test
    fun `the ambient badge lights for a wait or a problem`() {
        assertFalse(agentAmbient(listOf(project(entry("a", "Running", 1)))).isLit)
        val ambient =
            agentAmbient(listOf(project(entry("a", "Waiting", 1), entry("b", "Error", 1))))
        assertEquals(1, ambient.needsYou)
        assertTrue(ambient.hasError)
    }

    @Test
    fun `each terminal reads as its first row`() {
        val rows = projectAgentRows(
            project(entry("a", "Waiting", 1, pane = "t1"), entry("b", "Running", 2, pane = "t2")),
            now,
            emptyMap()
        )
        assertEquals(setOf("t1", "t2"), agentRowsByTerminal(rows).keys)
    }

    @Test
    fun `an update would cut off agents working or waiting, not finished ones`() {
        val busy = busyAgentPlaces(
            listOf(
                project(entry("a", "Running", 1), entry("b", "Waiting", 1), entry("c", "Done", 1)),
                project(entry("d", "Error", 1)).copy(name = "blog", label = "Blog")
            )
        )
        assertEquals(listOf(BusyAgentPlace("storefront", "storefront", 2)), busy)
    }
}

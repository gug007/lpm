package cx.lpm.mobile.feature.terminal.composer

import cx.lpm.mobile.core.model.CommandScope
import cx.lpm.mobile.core.model.SlashCommand
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SlashCommandsTest {
    private fun skill(name: String, folder: String?, description: String = "") = SlashCommand(
        name = name,
        description = description,
        argumentHint = "",
        source = "lpm",
        folder = folder,
        scope = CommandScope.Project
    )

    private fun agent(name: String, description: String = "") =
        SlashCommand(name = name, description = description, argumentHint = "", source = "builtin")

    private fun ran(row: SlashCommand, recentRuns: Int, lastRunAt: Long = 1) =
        row.copy(recentRuns = recentRuns, lastRunAt = lastRunAt)

    private fun List<SlashCommand>.names(query: String) = matching(query).map { it.name }

    @Test
    fun `a lone slash lists every row A-Z when nothing has run`() {
        val all = listOf(skill("zebra", "Z"), skill("lesson", null), agent("clear"), agent("model"))
        assertEquals(listOf("clear", "lesson", "model", "zebra"), all.names(""))
        assertFalse(all.matching("").any { it.mostUsed })
    }

    @Test
    fun `a lone slash leads with the commands run most, mixing skills and the agent's`() {
        val rows = listOf(
            ran(agent("effort"), 45),
            ran(skill("lesson", "Lessons"), 10),
            agent("add-dir"),
            ran(agent("simplify"), 33)
        )
        val sorted = rows.matching("")
        assertEquals(listOf("effort", "simplify", "lesson", "add-dir"), sorted.map { it.name })
        assertEquals(listOf(true, true, true, false), sorted.map { it.mostUsed })
    }

    @Test
    fun `most used shows five at most and files the rest A-Z`() {
        val rows = listOf("a", "b", "c", "d", "e", "f").mapIndexed { i, n -> ran(agent(n), 10 - i) }
        val sorted = (listOf(agent("zz")) + rows).matching("")
        assertEquals(listOf("a", "b", "c", "d", "e", "f", "zz"), sorted.map { it.name })
        assertEquals(5, sorted.count { it.mostUsed })
    }

    @Test
    fun `a tie goes to the latest run, then the name`() {
        val rows = listOf(ran(agent("older"), 2, 5), ran(agent("newer"), 2, 9), ran(agent("alpha"), 2, 5))
        assertEquals(listOf("newer", "alpha", "older"), rows.names(""))
    }

    @Test
    fun `an agent command named after the fragment beats an lpm skill that only mentions it`() {
        val all = listOf(
            skill("app-store-screenshots", "App Store", "Opens each screen in the iOS Simulator"),
            agent("simplify", "Clean up changed code")
        )
        assertEquals(listOf("simplify", "app-store-screenshots"), all.names("sim"))
    }

    @Test
    fun `a fragment ranks a name, a prefix, a later word, a folder, a middle, a description`() {
        val all = listOf(
            skill("zz-review", null),
            skill("audit", "Review"),
            skill("preview", null),
            skill("deploy", null, "a review"),
            agent("reviewer"),
            agent("review")
        )
        assertEquals(
            listOf("review", "reviewer", "zz-review", "audit", "preview", "deploy"),
            all.names("review")
        )
    }

    @Test
    fun `among equal matches the row run most leads, whoever made it`() {
        val rows = listOf(skill("simulate", null), ran(agent("simplify"), 33))
        assertEquals(listOf("simplify", "simulate"), rows.names("sim"))
    }

    @Test
    fun `typing drops the most used marks`() {
        val sorted = listOf(ran(agent("effort"), 3), agent("clear")).matching("eff")
        assertEquals(listOf("effort"), sorted.map { it.name })
        assertFalse(sorted.single().mostUsed)
    }

    @Test
    fun `a row's tag is a skill's folder, else its list, and the agent's own have none`() {
        val tag: (SlashCommand) -> String? = { it.tag("This project", "Global") }
        assertEquals("Lessons", tag(skill("x", "Lessons")))
        assertEquals("Reviews", tag(skill("x", "Work/Reviews")))
        assertEquals("This project", tag(skill("x", null)))
        assertEquals("Global", tag(skill("x", null).copy(scope = CommandScope.Global)))
        assertEquals("This project", tag(agent("x").copy(source = "project")))
        assertEquals("Global", tag(agent("x").copy(source = "user")))
        assertEquals("Docs", tag(agent("x").copy(source = "user", folder = "Docs")))
        assertNull(tag(agent("clear")))
    }

    @Test
    fun `only a command a message opens with counts as sent`() {
        assertEquals("compact", sentCommandName("/compact"))
        assertEquals("effort", sentCommandName("  /effort high\n"))
        assertEquals("prompts:draft", sentCommandName("/prompts:draft now"))
        assertNull(sentCommandName("please /compact"))
        assertNull(sentCommandName("/usr/bin/env"))
        assertTrue(sentCommandName("hello") == null)
    }
}

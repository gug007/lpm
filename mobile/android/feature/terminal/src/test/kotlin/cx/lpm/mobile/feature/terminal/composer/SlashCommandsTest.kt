package cx.lpm.mobile.feature.terminal.composer

import cx.lpm.mobile.core.model.CommandScope
import cx.lpm.mobile.core.model.SlashCommand
import org.junit.Assert.assertEquals
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

    private fun List<SlashCommand>.names(query: String) = matching(query).map { it.name }

    @Test
    fun `an agent command named after the fragment beats an lpm skill that only mentions it`() {
        val all = listOf(
            skill("app-store-screenshots", "App Store", "Opens each screen in the iOS Simulator"),
            agent("simplify", "Clean up changed code")
        )
        assertEquals(listOf("simplify", "app-store-screenshots"), all.names("sim"))
    }

    @Test
    fun `lpm skills win a tie with the agent's commands`() {
        assertEquals(
            listOf("simulate", "simplify"),
            listOf(skill("simulate", null), agent("simplify")).names("sim")
        )
        assertEquals(
            listOf("deploy", "review"),
            listOf(skill("deploy", null, "Run the simulator"), agent("review", "Find similar code"))
                .names("sim")
        )
    }

    @Test
    fun `the row named after the fragment leads its group`() {
        val all =
            listOf(skill("review-changes", "Review", "Audit my changes"), skill("audit", "Review"))
        assertEquals(listOf("audit", "review-changes"), all.names("aud"))
    }

    @Test
    fun `the folder with a prefix match leads and each folder stays together`() {
        val all = listOf(
            skill("review-changes", "Review", "Gaps in my changes"),
            skill("gaps", "Review"),
            skill("gap-finder", "Git")
        )
        assertEquals(listOf("gaps", "review-changes", "gap-finder"), all.names("gap"))
    }

    @Test
    fun `the agent's rows stay together under their heading`() {
        val all = listOf(
            skill("deploy", null, "Run the simulator"),
            agent("simplify"),
            agent("review", "Find similar code")
        )
        assertEquals(listOf("simplify", "review", "deploy"), all.names("sim"))
    }

    @Test
    fun `a lone slash keeps the full list`() {
        val all = listOf(skill("audit", "Review"), agent("simplify"))
        assertEquals(all, all.matching(""))
    }
}

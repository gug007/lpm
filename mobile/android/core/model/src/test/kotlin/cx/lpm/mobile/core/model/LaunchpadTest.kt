package cx.lpm.mobile.core.model

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LaunchpadTest {
    private val agents = listOf("claude", "codex", "gemini", "opencode")
        .map { AgentOption(it, it.uppercase(), emptyList()) }

    private fun terminal(name: String, cmd: String) =
        """{"name":"$name","type":"terminal","cmd":"$cmd"}"""

    private fun actions(json: String): List<Action> =
        Json.parseToJsonElement("""{"a":$json}""").jsonObject.list("a", Action::parse)

    @Test
    fun `an agent is the first command word that names one, by its file name`() {
        val ids = agents.map { it.id }
        assertEquals("claude", agentCli("claude --model opus", ids))
        assertEquals("codex", agentCli("FOO=1 /usr/local/bin/codex \"review\"", ids))
        assertEquals("codex", agentCli("cd app && codex", ids))
        assertEquals("gemini", agentCli("C:\\tools\\gemini.EXE", ids))
        assertNull(agentCli("npm test", ids))
        assertNull(agentCli("claude-wrapper", ids))
    }

    @Test
    fun `variants sharing a label carry their action's emoji, a bare agent has none`() {
        val tabs = launchpadTabs(
            actions(
                """[{"name":"claude","label":"Claude","emoji":"✻",""" +
                    """"type":"terminal","cmd":"claude","children":[""" +
                    """{"name":"claude:fast","label":"Claude","emoji":"⚡",""" +
                    """"type":"terminal","cmd":"claude --model haiku"},""" +
                    """{"name":"claude:plain","label":"Claude",""" +
                    """"type":"terminal","cmd":"claude --model opus"}]}]"""
            ),
            agents
        ) { null }

        val claude = tabs.single()
        assertEquals("✻", claude.emoji)
        assertEquals(listOf("✻", "⚡", ""), claude.options.map { it.emoji })
        assertEquals(listOf("✻ Claude", "⚡ Claude", "Claude"), claude.options.map { it.menuTitle })

        val bare = launchpadTabs(emptyList(), agents) { null }.first()
        assertEquals("", bare.emoji)
        assertEquals("", bare.options.single().emoji)
        assertEquals(bare.label, bare.options.single().menuTitle)
    }

    @Test
    fun `the project's agent actions, groups kept whole with only their agent items`() {
        val tabs = launchpadTabs(
            actions(
                """[{"name":"test","type":"command","cmd":"npm test"},""" +
                    """{"name":"claude","label":"Claude","primary":"last-used","children":[""" +
                    terminal("claude:opus", "claude --model opus") + "," +
                    terminal("claude:lint", "npm run lint") + "," +
                    terminal("claude:sonnet", "claude --model sonnet") + "]}," +
                    terminal("codex", "codex") + "," +
                    """{"name":"more","label":"More","children":[""" +
                    terminal("more:gemini", "gemini") + "," + terminal("more:open", "opencode") +
                    "]}]"
            ),
            agents
        ) { group -> "sonnet".takeIf { group == "claude" } }

        assertEquals(listOf("claude", "codex", "more"), tabs.map { it.id })
        val claude = tabs[0]
        assertEquals(listOf("claude:opus", "claude:sonnet"), claude.options.map { it.id })
        assertEquals("claude:sonnet", claude.primary?.id)
        assertEquals("claude", claude.options[0].group?.name)
        assertEquals("codex", tabs[1].primary?.agent)
        assertEquals(listOf("gemini", "opencode"), tabs[2].options.map { it.agent })
        assertNull(tabs[2].primary)
    }

    @Test
    fun `a project without agent actions offers the bare agents`() {
        val tabs =
            launchpadTabs(
                actions("""[{"name":"test","type":"terminal","cmd":"npm test"}]"""),
                agents
            )
        assertEquals(listOf("claude", "codex", "gemini", "opencode"), tabs.map { it.id })
        assertNull(tabs[0].primary?.action)
        assertEquals("CLAUDE", tabs[0].label)
    }

    private fun agentAction(name: String, cmd: String, prompt: String = "") = Action(
        name = name, label = name, emoji = "", type = "terminal", display = "", layer = "",
        position = null, color = "", primary = "", cmd = cmd, confirm = false,
        inputs = emptyList(), children = emptyList(), prompt = prompt
    )

    private fun ownTask(cmd: String, prompt: String = "") =
        agentAction("a", cmd, prompt).startsOwnTask(agentCli(cmd, agents.map { it.id })!!)

    @Test
    fun `a task in the agent's own words or a saved prompt is the action's own`() {
        assertTrue(ownTask("""claude "Review my changes""""))
        assertTrue(ownTask("claude --model opus 'Fix the failing tests'"))
        assertTrue(ownTask("claude", prompt = "Write the release notes"))
    }

    @Test
    fun `flags, their values and other commands carry no task`() {
        assertFalse(ownTask("claude --permission-mode auto"))
        assertFalse(ownTask("""codex -c 'model_reasoning_effort="ultra"'"""))
        assertFalse(ownTask("""claude --append-system-prompt "Be brief""""))
        assertFalse(ownTask("""codex -c model="gpt 6""""))
        assertFalse(ownTask("""claude && echo "all done now""""))
        assertFalse(ownTask("""cd "my project" && claude"""))
        assertFalse(ownTask("claude", prompt = "  "))
    }

    @Test
    fun `actions with their own task stay off a list for a prompt that is the task`() {
        val review = agentAction("review", """claude "Review my changes"""")
        val codex = agentAction("codex", "codex")
        assertEquals(
            listOf("codex"),
            launchpadTabs(listOf(review, codex), agents, skipOwnTasks = true).map { it.id }
        )
        assertEquals(
            listOf("review", "codex"),
            launchpadTabs(listOf(review, codex), agents).map { it.id }
        )
        assertEquals(
            agents.map { it.id },
            launchpadTabs(listOf(review), agents, skipOwnTasks = true).map { it.id }
        )
    }
}

package cx.lpm.mobile.core.model

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LpmCommandsTest {
    @Test
    fun namesFollowTheMacsRule() {
        assertTrue(isValidCommandName("fix-ticket"))
        assertTrue(isValidCommandName("a-1"))
        assertFalse(isValidCommandName("a_1"))
        assertFalse(isValidCommandName("Fix"))
        assertFalse(isValidCommandName("two--dashes"))
        assertFalse(isValidCommandName("fix-"))
        assertFalse(isValidCommandName(""))
        assertFalse(isValidCommandName("-fix"))
        assertFalse(isValidCommandName("fix ticket"))
        assertFalse(isValidCommandName("a".repeat(65)))
    }

    @Test
    fun aWholeMessageRunsACommand() {
        assertEquals(
            CommandRun("fix-ticket", "LPM-12 now"),
            parseCommandRun(" /fix-ticket  LPM-12 now ")
        )
        assertEquals(CommandRun("explain", ""), parseCommandRun("/explain"))
        assertNull(parseCommandRun("please /explain"))
        assertNull(parseCommandRun("/"))
    }

    @Test
    fun variablesSplitIntoAsksAndAuto() {
        assertEquals(
            PromptVariables(listOf("ticket", "who"), listOf("branch")),
            promptVariables("Fix {{ticket}} on {{ branch }} for {{who}}, {{ticket}} again")
        )
        assertEquals(
            PromptVariables(listOf("what"), listOf("dir")),
            promptVariables("Read {{dir}}/GUIDE.md about {{what}}")
        )
        assertTrue(promptVariables("No variables, just \$ARGUMENTS").isEmpty)
    }

    @Test
    fun listsWithoutAProjectOfferOnlyGlobal() {
        assertEquals(listOf(CommandScope.Global), LpmCommandLists().scopes)
        assertEquals(
            listOf(CommandScope.Project, CommandScope.Global),
            LpmCommandLists(project = LpmCommandList()).scopes
        )
    }

    @Test
    fun otherSkillsSayWhichAgentsReadThem() {
        val skill = OtherSkill("lint", "", "", listOf("claude", "opencode"), "")
        assertEquals(
            listOf(
                AgentReach("Claude Code", true),
                AgentReach("Codex", false),
                AgentReach("Gemini", false),
                AgentReach("OpenCode", true)
            ),
            skill.reach
        )
    }

    @Test
    fun otherSkillAtTheTopShowsWithTheSkillsInNoFolder() {
        val inGroup = OtherSkill("lint", "", "", emptyList(), "")
        val atRoot = OtherSkill("docs", "", "", emptyList(), "", atRoot = true)
        val filed = OtherSkill("ship", "", "", emptyList(), "", folder = "Ops")
        val list = LpmCommandList(others = listOf(inGroup, atRoot, filed))
        assertEquals(listOf(atRoot), list.othersIn(null))
        assertEquals(listOf(filed), list.othersIn("Ops"))
        assertEquals(listOf(inGroup), list.otherGroup)
        assertEquals(OtherSpot(root = true), atRoot.spot)
        assertEquals(OtherSpot(), inGroup.spot)
        assertEquals(OtherSpot("Ops"), filed.spot)
    }

    @Test
    fun aFolderPathSplitsIntoItsParentAndOwnName() {
        assertEquals("Work/Reviews", folderParent("Work/Reviews/Deep"))
        assertNull(folderParent("Work"))
        assertEquals("Deep", folderLabel("Work/Reviews/Deep"))
        assertEquals("Work", folderLabel("Work"))
        assertEquals("Work/Reviews", childFolder("Work", " Reviews "))
        assertEquals("Work", childFolder(null, "Work"))
        assertEquals("", childFolder("Work", "  "))
    }

    @Test
    fun aNeighbourWithTheSameStartIsntInside() {
        assertTrue(isWithinFolder("Work/Reviews", "Work"))
        assertTrue(isWithinFolder("Work", "Work"))
        assertFalse(isWithinFolder("Workshop", "Work"))
    }

    @Test
    fun aListNamesEachLevelsFoldersAndCountsAllThatsInside() {
        val command = { name: String, folder: String? ->
            LpmCommand(name, folder, "", "", CommandScope.Global, "")
        }
        val list = LpmCommandList(
            folders = listOf("Work", "Work/Reviews", "Work/Reviews/Deep", "Workshop"),
            commands = listOf(
                command("a", "Work"),
                command("b", "Work/Reviews/Deep"),
                command("c", "Workshop"),
                command("d", null)
            ),
            others = listOf(OtherSkill("o", "", "", emptyList(), "", folder = "Work/Reviews"))
        )
        assertEquals(listOf("Work", "Workshop"), list.subfolders(null))
        assertEquals(listOf("Work/Reviews"), list.subfolders("Work"))
        assertEquals(3, list.countIn("Work"))
        assertEquals(2, list.countIn("Work/Reviews"))
        assertEquals(1, list.countIn("Workshop"))
        assertEquals(1, list.countIn(null))
    }

    @Test
    fun runsSayHowLongAgoAndHowOften() {
        val now = 1_792_089_000_000L
        val minute = 60_000L
        val day = 24 * 60 * minute
        assertEquals("now", runAge(now - 20_000, now))
        assertEquals("40m", runAge(now - 40 * minute, now))
        assertEquals("2h", runAge(now - 125 * minute, now))
        assertEquals("41d", runAge(now - 41 * day, now))
        assertEquals("3mo", runAge(now - 90 * day, now))
        assertEquals("2y", runAge(now - 800 * day, now))
        assertEquals("now", runAge(now + minute, now))
        val ran =
            LpmCommand(
                "ship",
                null,
                "",
                "Do it.",
                CommandScope.Global,
                "",
                runs = 14,
                lastRunAt =
                    now - 2 * 60 * minute
            )
        assertEquals("2h · 14×", ran.runsLabel(now))
        assertNull(ran.copy(runs = 0).runsLabel(now))
        assertNull(ran.copy(lastRunAt = null).runsLabel(now))
    }

    @Test
    fun runsAreReadFromTheMacsList() {
        val o = Json.parseToJsonElement(
            """{"name":"ship","scope":"global","runs":3,"lastRunAt":1792089000123}"""
        ).jsonObject
        val c = LpmCommand.parse(o)
        assertEquals(3, c.runs)
        assertEquals(1_792_089_000_123L, c.lastRunAt)
        assertEquals(
            0,
            LpmCommand.parse(Json.parseToJsonElement("""{"name":"old"}""").jsonObject).runs
        )
    }
}

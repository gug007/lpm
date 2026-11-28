package cx.lpm.mobile.core.model

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TalkPlanTest {
    private fun parse(json: String) = TalkPlan.parse(Json.parseToJsonElement(json) as JsonObject)

    private fun plan(place: TalkPlace, project: String = "glimpse", prompt: String = "Fix it") =
        TalkPlan(project = project, place = place, agent = "claude", prompt = prompt, label = "")

    @Test
    fun `a plan reads every field the Mac sends`() {
        assertEquals(
            TalkPlan("glimpse", TalkPlace.Copy, "codex", "Fix the latest issue", "issue"),
            parse(
                """{"project":"glimpse","where":"copy","agent":"codex",
                    "prompt":"Fix the latest issue","label":"issue"}"""
            )
        )
        assertEquals(
            TalkPlan("", TalkPlace.Here, "", "", ""),
            parse("""{"where":"here","project":null,"agent":7}""")
        )
        assertEquals(TalkPlace.Worktree, parse("""{"where":"worktree"}""")?.place)
    }

    @Test
    fun `a plan with no place the phone knows is no plan`() {
        assertNull(parse("""{"project":"glimpse","where":"branch"}"""))
        assertNull(parse("""{"project":"glimpse"}"""))
    }

    @Test
    fun `Approve waits for a project and a prompt`() {
        assertTrue(plan(TalkPlace.Here).canRun)
        assertFalse(plan(TalkPlace.Here, project = "").canRun)
        assertFalse(plan(TalkPlace.Here, prompt = " \n ").canRun)
    }

    @Test
    fun `the rows say where the agent starts`() {
        val copy = plan(TalkPlace.Copy)
        assertEquals("3 steps", copy.stepCount)
        assertEquals("Duplicate", copy.placeTitle)
        assertEquals("Claude Code, in the copy", copy.startLine("Claude Code"))

        val worktree = plan(TalkPlace.Worktree)
        assertEquals("3 steps", worktree.stepCount)
        assertEquals("Worktree", worktree.placeTitle)
        assertEquals("Codex, in the worktree", worktree.startLine("Codex"))

        val here = plan(TalkPlace.Here)
        assertEquals("2 steps", here.stepCount)
        assertEquals("In", here.placeTitle)
        assertEquals("Gemini", here.startLine("Gemini"))
    }
}

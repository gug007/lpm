package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.TalkPlace
import cx.lpm.mobile.core.model.TalkPlan
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** `talkPlan` and `talkRun` (PROTOCOL.md, Talk). */
class TalkFrameTest {
    private val plan = TalkPlan(
        project = "glimpse",
        place = TalkPlace.Copy,
        agent = "claude",
        prompt = "fix the latest GitHub issue assigned to me",
        label = "latest-issue"
    )

    @Test
    fun theSentenceGoesAsText() {
        assertFrame(
            """{ "t": "talkPlan", "reqId": "r1", "text": "fix the latest issue in glimpse" }""",
            Wire.talkPlan("r1", "fix the latest issue in glimpse")
        )
    }

    @Test
    fun theWholePlanGoesBack() {
        assertFrame(
            """{ "t": "talkRun", "reqId": "r2", "plan": { "project": "glimpse", "where": "copy",
                 "agent": "claude", "prompt": "fix the latest GitHub issue assigned to me",
                 "label": "latest-issue" } }""",
            Wire.talkRun("r2", plan)
        )
        assertFrame(
            """{ "t": "talkRun", "reqId": "r3", "plan": { "project": "glimpse", "where": "here",
                 "agent": "codex", "prompt": "x", "label": "" } }""",
            Wire.talkRun("r3", TalkPlan("glimpse", TalkPlace.Here, "codex", "x", ""))
        )
    }

    @Test
    fun aPlanComesWithTheProjectsItCouldMean() {
        val f = decode<TalkPlanReply>(
            """{ "t": "talkPlan", "reqId": "r1", "ok": true,
                 "plan": { "project": "", "where": "worktree", "agent": "codex",
                   "prompt": "tidy the README", "label": "readme" },
                 "candidates": ["glimpse", "glimpse-api"] }"""
        )
        assertEquals("r1", f.reqId)
        assertEquals(TalkPlan("", TalkPlace.Worktree, "codex", "tidy the README", "readme"), f.plan)
        assertEquals(listOf("glimpse", "glimpse-api"), f.candidates)
        assertFalse(f.unsupported)
    }

    @Test
    fun aRequestAPlanCannotCarryOutSaysSo() {
        val f = decode<TalkPlanReply>(
            """{ "t": "talkPlan", "reqId": "r1", "ok": false, "unsupported": true,
                 "error": "A plan can only duplicate a project." }"""
        )
        assertNull(f.plan)
        assertTrue(f.unsupported)
        assertEquals("A plan can only duplicate a project.", f.error)
    }

    @Test
    fun aFailureIsOneToOfferAgain() {
        val f = decode<TalkPlanReply>("""{ "t": "talkPlan", "reqId": "r1", "ok": false }""")
        assertNull(f.plan)
        assertFalse(f.unsupported)
        assertEquals("The Mac couldn't do it.", f.error)
        assertEquals(emptyList<String>(), f.candidates)

        val unreadable = decode<TalkPlanReply>(
            """{ "t": "talkPlan", "reqId": "r1", "ok": true, "unsupported": true,
                 "plan": { "project": "glimpse", "where": "elsewhere" } }"""
        )
        assertNull(unreadable.plan)
        assertFalse(unreadable.unsupported)
    }

    @Test
    fun aRunStartsOrIsRefused() {
        assertEquals(
            TalkRunReply("r2", null),
            decode<TalkRunReply>("""{ "t": "talkRun", "reqId": "r2", "ok": true }""")
        )
        assertEquals(
            TalkRunReply("r2", "That project isn't available."),
            decode<TalkRunReply>(
                """{ "t": "talkRun", "reqId": "r2", "ok": false,
                     "error": "That project isn't available." }"""
            )
        )
        assertEquals(
            TalkRunReply("", "The Mac couldn't do it."),
            decode<TalkRunReply>("""{ "t": "talkRun" }""")
        )
    }
}

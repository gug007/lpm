package cx.lpm.mobile.core.data.talk

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.testing.FakeSocket
import cx.lpm.mobile.core.data.testing.SessionHarness
import cx.lpm.mobile.core.data.testing.settleAlive
import cx.lpm.mobile.core.model.Haptic
import cx.lpm.mobile.core.model.TalkPlace
import cx.lpm.mobile.core.model.TalkPlan
import cx.lpm.mobile.core.model.obj
import cx.lpm.mobile.core.model.string
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class TalkStoreTest {
    private class Fixture(val h: SessionHarness, val socket: FakeSocket) {
        val store: TalkStore = h.session.store()
        val state: TalkState get() = store.state.value

        fun settle() = h.scheduler.runCurrent()

        fun lastId(type: String): String = socket.sentOf(type).last().string("reqId")!!

        fun ask(sentence: String) {
            store.begin()
            store.setText(sentence)
            store.makePlan()
            settle()
        }

        fun answerPlan(
            reqId: String = lastId("talkPlan"),
            project: String = "glimpse",
            where: String = "copy",
            candidates: String = ""
        ) {
            socket.receive(
                """{"t":"talkPlan","reqId":"$reqId","ok":true,"plan":{"project":"$project",""" +
                    """"where":"$where","agent":"claude","prompt":"Tidy the README",""" +
                    """"label":"readme"},"candidates":[$candidates]}"""
            )
            settle()
        }
    }

    private fun TestScope.ready(offered: Boolean = true): Fixture {
        val h = SessionHarness(this)
        val features = if (offered) listOf(LpmClient.TALK_FEATURE) else emptyList()
        return Fixture(h, h.connectReady(features))
    }

    @Test
    fun `only a Mac that lists talk offers it`() = runTest {
        assertTrue(ready().state.available)
        assertFalse(ready(offered = false).state.available)
    }

    @Test
    fun `a sentence becomes a plan to approve`() = runTest {
        val f = ready()
        f.store.begin()
        assertTrue(f.state.open)
        assertEquals(1, f.socket.sentOf("agentOptions").size)

        f.store.setText("  tidy the README in a copy of glimpse \n")
        assertTrue(f.state.hasText)
        f.store.makePlan()
        f.settle()
        assertEquals(TalkPhase.Planning, f.state.phase)
        val sent = f.socket.sentOf("talkPlan").single()
        assertEquals("tidy the README in a copy of glimpse", sent.string("text"))

        f.answerPlan(candidates = """"glimpse","glimpse-api"""")
        assertEquals(TalkPhase.Plan, f.state.phase)
        assertEquals(
            TalkPlan("glimpse", TalkPlace.Copy, "claude", "Tidy the README", "readme"),
            f.state.plan
        )
        assertEquals(listOf("glimpse", "glimpse-api"), f.state.candidates)
    }

    @Test
    fun `nothing is asked without a sentence or while a plan is on its way`() = runTest {
        val f = ready()
        f.ask(" \n ")
        assertEquals(TalkPhase.Ask, f.state.phase)
        assertFalse(f.state.hasText)

        f.store.setText("fix it")
        f.store.makePlan()
        f.store.makePlan()
        f.settle()
        assertEquals(1, f.socket.sentOf("talkPlan").size)
    }

    @Test
    fun `a request a plan cannot carry out says so and keeps the sentence`() = runTest {
        val f = ready()
        f.ask("Delete the blog project")
        f.socket.receive(
            """{"t":"talkPlan","reqId":"${f.lastId("talkPlan")}","ok":false,""" +
                """"unsupported":true,"error":"A plan can only duplicate a project."}"""
        )
        f.settle()
        assertEquals(
            TalkPhase.Failed(unsupported = true, "A plan can only duplicate a project."),
            f.state.phase
        )

        f.store.tryAgain()
        assertEquals(TalkPhase.Ask, f.state.phase)
        assertEquals("Delete the blog project", f.state.text)
    }

    @Test
    fun `a Mac that never answers is given two minutes`() = runTest {
        val f = ready()
        f.ask("fix it")
        settleAlive(f.socket, 119_000)
        assertEquals(TalkPhase.Planning, f.state.phase)
        settleAlive(f.socket, 1_000)
        assertEquals(
            TalkPhase.Failed(unsupported = false, "The Mac didn't answer in time."),
            f.state.phase
        )
    }

    @Test
    fun `a dropped link fails the plan it was waiting for`() = runTest {
        val f = ready()
        f.ask("fix it")
        f.store.onConnectionReset()
        f.settle()
        assertEquals(
            TalkPhase.Failed(unsupported = false, "Lost the connection to the Mac."),
            f.state.phase
        )
    }

    @Test
    fun `a reply that comes after the sheet is shut is ignored`() = runTest {
        val f = ready()
        f.ask("fix it")
        val late = f.lastId("talkPlan")
        f.store.close()
        assertFalse(f.state.open)

        f.ask("fix something else")
        f.answerPlan(reqId = late, project = "old")
        assertEquals(TalkPhase.Planning, f.state.phase)
        assertNull(f.state.plan)

        f.answerPlan(project = "new")
        assertEquals("new", f.state.plan?.project)
    }

    @Test
    fun `approve sends the plan as it was edited and closes once the Mac starts it`() = runTest {
        val f = ready()
        f.ask("tidy the README in a worktree")
        f.answerPlan(project = "", where = "worktree", candidates = """"glimpse"""")
        f.store.approve()
        f.settle()
        assertTrue(f.socket.sentOf("talkRun").isEmpty())

        f.store.setProject("glimpse")
        f.store.setAgent("codex")
        f.store.setPrompt("  Tidy the README, then commit \n")
        f.store.approve()
        f.store.approve()
        f.settle()
        assertTrue(f.state.running)
        val plan = f.socket.sentOf("talkRun").single().obj("plan")!!
        assertEquals("glimpse", plan.string("project"))
        assertEquals("worktree", plan.string("where"))
        assertEquals("codex", plan.string("agent"))
        assertEquals("Tidy the README, then commit", plan.string("prompt"))
        assertEquals("readme", plan.string("label"))

        f.socket.receive("""{"t":"talkRun","reqId":"${f.lastId("talkRun")}","ok":true}""")
        f.settle()
        assertFalse(f.state.open)
        assertFalse(f.state.running)
        assertNull(f.state.runError)
        assertEquals(Haptic.Success, f.state.feedback?.haptic)
    }

    @Test
    fun `a refused run stays up with the reason`() = runTest {
        val f = ready()
        f.ask("fix it in glimpse")
        f.answerPlan()
        f.store.approve()
        f.settle()
        f.socket.receive(
            """{"t":"talkRun","reqId":"${f.lastId("talkRun")}","ok":false,""" +
                """"error":"That project isn't available."}"""
        )
        f.settle()
        assertTrue(f.state.open)
        assertFalse(f.state.running)
        assertEquals("That project isn't available.", f.state.runError)
        assertEquals(Haptic.Error, f.state.feedback?.haptic)

        f.store.approve()
        f.settle()
        assertNull(f.state.runError)
        assertEquals(2, f.socket.sentOf("talkRun").size)
    }

    @Test
    fun `a plan approved while the link is down is not sent, then or later`() = runTest {
        val f = ready()
        f.ask("fix it in glimpse")
        f.answerPlan()
        f.socket.fail()
        f.settle()
        assertEquals(TalkPhase.Plan, f.state.phase)

        f.store.approve()
        f.settle()
        assertFalse(f.state.running)
        assertEquals("Lost the connection to the Mac.", f.state.runError)
        assertTrue(f.h.transport.sockets.none { it.sentOf("talkRun").isNotEmpty() })
    }

    @Test
    fun `a run the Mac never answers stops waiting after thirty seconds`() = runTest {
        val f = ready()
        f.ask("fix it in glimpse")
        f.answerPlan()
        f.store.approve()
        settleAlive(f.socket, 30_000)
        assertFalse(f.state.running)
        assertEquals("The Mac didn't answer in time.", f.state.runError)
        assertTrue(f.state.open)
    }

    @Test
    fun `a take's words become the sentence and ask for the plan`() = runTest {
        val f = ready()
        f.store.insertDictated("ignored while the sheet is shut")
        assertEquals("", f.state.text)

        f.store.begin()
        f.store.setText("In glimpse,")
        f.store.insertDictated("  ")
        f.settle()
        assertEquals(TalkPhase.Ask, f.state.phase)

        f.store.setText("In glimpse,")
        f.store.insertDictated("run the tests")
        f.settle()
        assertEquals("In glimpse, run the tests", f.state.text)
        assertEquals(TalkPhase.Planning, f.state.phase)
        assertEquals(
            "In glimpse, run the tests",
            f.socket.sentOf("talkPlan").single().string("text")
        )
    }

    @Test
    fun `switching Macs starts over`() = runTest {
        val f = ready()
        f.ask("fix it in glimpse")
        f.store.reset()
        f.settle()
        assertEquals(TalkState(), f.state)
    }
}

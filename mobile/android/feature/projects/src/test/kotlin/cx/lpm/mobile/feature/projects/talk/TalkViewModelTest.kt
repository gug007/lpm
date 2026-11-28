package cx.lpm.mobile.feature.projects.talk

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.dictation.DictationEngine
import cx.lpm.mobile.core.data.dictation.DictationFailure
import cx.lpm.mobile.core.data.dictation.DictationMeter
import cx.lpm.mobile.core.data.dictation.DictationResult
import cx.lpm.mobile.core.data.dictation.DictationStore
import cx.lpm.mobile.core.data.talk.TalkPhase
import cx.lpm.mobile.core.data.terminals.TerminalsStore
import cx.lpm.mobile.core.model.TalkPlace
import cx.lpm.mobile.core.testing.MainDispatcherRule
import cx.lpm.mobile.core.testing.TestSession
import cx.lpm.mobile.feature.projects.ScreenStores
import cx.lpm.mobile.feature.projects.demoSession
import cx.lpm.mobile.feature.projects.settle
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class TalkViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private class FakeEngine : DictationEngine {
        var finished: ((DictationResult) -> Unit)? = null
        var cancelled = false

        override fun start(
            meter: DictationMeter,
            heard: (String) -> Unit,
            finished: (DictationResult) -> Unit
        ): DictationFailure? {
            this.finished = finished
            return null
        }

        override fun stop() = Unit

        override fun cancel() {
            cancelled = true
        }
    }

    private val engine = FakeEngine()

    private fun TestScope.subscribed(t: TestSession): TalkViewModel {
        val vm = TalkViewModel(t.session, DictationStore(makeEngine = { engine }))
        backgroundScope.launch { vm.uiState.collect() }
        t.settle()
        return vm
    }

    private fun TalkViewModel.plan(t: TestSession, sentence: String) {
        begin()
        setText(sentence)
        makePlan()
        t.settle(PLAN_MS)
    }

    @Test
    fun `the button is there once a Mac that can plan lists a project`() = runTest {
        val t = TestSession(this, ScreenStores)
        val socket = t.connectReady(features = listOf(LpmClient.TALK_FEATURE))
        val vm = subscribed(t)
        assertFalse(vm.uiState.value.offered)

        socket.receive("""{"t":"projects","projects":[{"name":"web"}]}""")
        t.settle()
        assertTrue(vm.uiState.value.offered)
        assertFalse(vm.uiState.value.open)
    }

    @Test
    fun `a Mac that cannot plan has no button`() = runTest {
        val t = TestSession(this, ScreenStores)
        val socket = t.connectReady()
        socket.receive("""{"t":"projects","projects":[{"name":"web"}]}""")
        assertFalse(subscribed(t).uiState.value.offered)
    }

    @Test
    fun `a plan with no project lists the ones the sentence could mean first`() = runTest {
        val t = demoSession()
        val vm = subscribed(t)
        assertTrue(vm.uiState.value.offered)

        vm.plan(t, "Run the tests and fix anything that fails.")
        val state = vm.uiState.value
        assertEquals(TalkPhase.Plan, state.talk.phase)
        assertEquals("", state.talk.plan?.project)
        assertEquals(TalkPlace.Here, state.talk.plan?.place)
        assertFalse(state.talk.plan!!.canRun)
        assertEquals(
            listOf("storefront", "api-gateway", "mobile-app", "blog", "design-system"),
            state.projects.map { it.id }
        )
        assertEquals(
            listOf("Claude Code", "Codex", "Gemini", "OpenCode"),
            state.agents.map { it.title }
        )
        assertEquals("Claude Code", state.agentLabel("claude"))
        assertEquals("cursor", state.agentLabel("cursor"))
        assertEquals("design-system", state.projectTitle("design-system"))
        assertEquals("gone", state.projectTitle("gone"))
    }

    @Test
    fun `an approved plan opens the agent's tab in the project picked`() = runTest {
        val t = demoSession()
        val vm = subscribed(t)
        vm.plan(t, "Run the tests and fix anything that fails.")
        vm.setProject("design-system")
        vm.setAgent("codex")
        vm.setPrompt("Run the tests. Then commit.")
        assertTrue(vm.uiState.value.talk.plan!!.canRun)

        vm.approve()
        t.settle()
        assertFalse(vm.uiState.value.open)
        val tabs = t.store<TerminalsStore>().state.value.terminals["design-system"].orEmpty()
        assertEquals("Codex", tabs.last().label)
    }

    @Test
    fun `a take that ends with words asks for the plan by itself`() = runTest {
        val t = demoSession()
        val vm = subscribed(t)
        vm.begin()
        vm.startDictation()
        engine.finished?.invoke(DictationResult.Words("Fix the cart badge in a copy of storefront"))
        t.settle(PLAN_MS)

        val plan = vm.uiState.value.talk.plan!!
        assertEquals("storefront", plan.project)
        assertEquals(TalkPlace.Copy, plan.place)
        assertEquals("Fix the cart badge in a copy of storefront", plan.prompt)
    }

    @Test
    fun `closing the sheet drops the take it started`() = runTest {
        val t = demoSession()
        val vm = subscribed(t)
        vm.begin()
        vm.startDictation()
        assertTrue(vm.dictationState.value.isActive(TalkViewModel.DICTATION_OWNER))

        vm.close()
        assertTrue(engine.cancelled)
        assertFalse(vm.dictationState.value.isActive(TalkViewModel.DICTATION_OWNER))
        assertFalse(vm.uiState.value.open)
    }

    private companion object {
        const val PLAN_MS = 1_500L
    }
}

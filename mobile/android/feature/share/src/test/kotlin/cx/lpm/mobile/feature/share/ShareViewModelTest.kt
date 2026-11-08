package cx.lpm.mobile.feature.share

import cx.lpm.mobile.core.model.ShareDestination
import cx.lpm.mobile.core.model.string
import cx.lpm.mobile.core.testing.MainDispatcherRule
import cx.lpm.mobile.core.testing.settle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class ShareViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private val link = SharedInput(texts = listOf("https://example.com/post"), title = "A post")

    @Test
    fun `it starts where the last share ended`() = runTest {
        val f = ShareFixture(this)
        f.choices.mac = "srv-1"
        f.choices.project = "api"
        f.choices.destination = "notes"
        f.choices.agent = "codex"
        val vm = f.viewModel()
        vm.start(link)
        settle()

        val state = vm.uiState.value
        assertEquals(SharePhase.Ready, state.phase)
        assertEquals("srv-1", state.macId)
        assertEquals("api", state.project)
        assertEquals("api", state.projectTitle)
        assertEquals(ShareDestination.Notes, state.destination)
        assertEquals("codex", state.agent)
        assertEquals("A post", state.items.headline)
    }

    @Test
    fun `a Mac that can't start agents sends to notes and forgotten picks fall back`() = runTest {
        val f = ShareFixture(this)
        f.choices.mac = "srv-gone"
        f.choices.project = "nope"
        val vm = f.viewModel()
        vm.start(link)
        settle()
        assertEquals("srv-1", vm.uiState.value.macId)
        assertEquals("storefront", vm.uiState.value.project)
        assertEquals("Storefront", vm.uiState.value.projectTitle)
        assertEquals(ShareDestination.Agent, vm.uiState.value.destination)
        assertEquals("claude", vm.uiState.value.agent)

        vm.selectMac("srv-2")
        assertEquals("blog", vm.uiState.value.project)
        assertEquals(ShareDestination.Notes, vm.uiState.value.destination)
        assertEquals("", vm.uiState.value.agent)
        assertTrue(vm.uiState.value.canSend)
    }

    @Test
    fun `there's nothing to send until something came in or a note is written`() = runTest {
        val f = ShareFixture(this)
        val vm = f.viewModel()
        assertFalse(vm.uiState.value.canSend)
        vm.start(SharedInput())
        settle()
        assertFalse(vm.uiState.value.canSend)
        vm.setNote("  ")
        assertFalse(vm.uiState.value.canSend)
        vm.setNote("Look into the flaky test")
        assertTrue(vm.uiState.value.canSend)
        vm.setAgent("gemini")
        assertFalse(vm.uiState.value.canSend)
        vm.setDestination(ShareDestination.Notes)
        assertTrue(vm.uiState.value.canSend)
    }

    @Test
    fun `up to five images come in, the first one the thumbnail`() = runTest {
        val f = ShareFixture(this)
        repeat(6) { f.encoded["content://photo/$it"] = byteArrayOf(it.toByte()) }
        val vm = f.viewModel()
        val streams = listOf("content://doc/notes.txt") + List(6) { "content://photo/$it" }
        vm.start(SharedInput(texts = listOf("Our office"), streams = streams))
        settle()
        val items = vm.uiState.value.items
        assertEquals(5, items.images.size)
        assertEquals(0.toByte(), items.images.first().single())
        assertEquals(listOf(items.images.first()), f.thumbnailed)
        assertEquals(listOf("Our office"), items.texts)
    }

    @Test
    fun `sending starts the agent, remembers the choices and closes on success`() = runTest {
        val f = ShareFixture(this)
        f.t.prober.reachable += "192.168.1.20"
        val vm = f.viewModel()
        vm.start(link)
        settle()
        vm.setNote("Summarize this")
        vm.setAgent("codex")
        vm.send()
        assertEquals(SharePhase.Sending, vm.uiState.value.phase)
        val socket = f.signIn()
        val tab = socket.sentOf("newTerminal").single()
        assertEquals("storefront", tab.string("project"))
        assertEquals("codex", tab.string("agent"))
        assertEquals("Summarize this\n\nhttps://example.com/post", tab.string("prompt"))
        socket.receive("""{"t":"newTerminal","ok":true}""")
        settle()

        assertEquals(SharePhase.Sent, vm.uiState.value.phase)
        assertEquals("srv-1", f.choices.mac)
        assertEquals("storefront", f.choices.project)
        assertEquals("agent", f.choices.destination)
        assertEquals("codex", f.choices.agent)
        assertTrue(f.inbox.all().isEmpty())
    }

    @Test
    fun `a Mac that doesn't answer gets the share later, images and all`() = runTest {
        val f = ShareFixture(this)
        f.encoded["content://photo/1"] = byteArrayOf(7, 8)
        val vm = f.viewModel()
        vm.start(SharedInput(streams = listOf("content://photo/1")))
        settle()
        vm.setDestination(ShareDestination.Notes)
        vm.send()
        settle()

        assertEquals(SharePhase.Queued, vm.uiState.value.phase)
        val kept = f.inbox.all().single()
        assertEquals("srv-1", kept.serverId)
        assertEquals("Studio Mac", kept.macName)
        assertEquals(ShareDestination.Notes, kept.destination)
        assertEquals("", kept.agent)
        assertEquals(listOf(7.toByte(), 8.toByte()), f.inbox.images(kept).single().toList())
        // Notes was picked; the agent last used stays remembered.
        assertEquals("notes", f.choices.destination)
        assertNull(f.choices.agent)
    }

    @Test
    fun `the Mac's refusal is shown and the sheet can try again`() = runTest {
        val f = ShareFixture(this)
        f.t.prober.reachable += "192.168.1.20"
        val vm = f.viewModel()
        vm.start(link)
        settle()
        vm.send()
        val socket = f.signIn()
        socket.receive("""{"t":"newTerminal","ok":false,"error":"The lpm window is closed."}""")
        settle()
        assertEquals(SharePhase.Failed("The lpm window is closed."), vm.uiState.value.phase)
        assertTrue(f.inbox.all().isEmpty())
        vm.dismissFailure()
        assertEquals(SharePhase.Ready, vm.uiState.value.phase)
        assertTrue(vm.uiState.value.canSend)
    }
}

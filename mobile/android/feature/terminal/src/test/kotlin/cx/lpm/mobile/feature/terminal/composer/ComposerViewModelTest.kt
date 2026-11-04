package cx.lpm.mobile.feature.terminal.composer

import androidx.compose.foundation.text.input.setTextAndPlaceCursorAtEnd
import androidx.compose.runtime.snapshots.Snapshot
import cx.lpm.mobile.core.data.commands.LpmCommandsStore
import cx.lpm.mobile.core.data.git.GitStore
import cx.lpm.mobile.core.data.services.ServiceLogsStore
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.data.terminals.TerminalHooks
import cx.lpm.mobile.core.data.terminals.TerminalsStore
import cx.lpm.mobile.core.model.ServiceInfo
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.string
import cx.lpm.mobile.core.testing.FakeSocket
import cx.lpm.mobile.core.testing.MainDispatcherRule
import cx.lpm.mobile.core.testing.TestSession
import cx.lpm.mobile.feature.terminal.R
import cx.lpm.mobile.feature.terminal.history.HistoryStore
import java.nio.file.Files
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ComposerViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private val submitted = mutableListOf<String>()
    private val target = ComposerTarget("t1", "storefront", "Claude", SessionKey.Live)

    private class Setup(val t: TestSession, val socket: FakeSocket, val vm: ComposerViewModel)

    private fun TestScope.setup(
        screenOpen: Boolean = true,
        target: ComposerTarget = this@ComposerViewModelTest.target
    ): Setup {
        val media = FakeMedia(Files.createTempDirectory("composer").toFile())
        val io = StandardTestDispatcher(testScheduler)
        val t = TestSession(
            this,
            stores = setOf(
                SessionStore.Factory {
                    ComposerSessions(it, media, io, "phone") { testScheduler.currentTime }
                },
                SessionStore.Factory(::HistoryStore),
                SessionStore.Factory(::ServiceLogsStore),
                SessionStore.Factory(::GitStore),
                SessionStore.Factory(::LpmCommandsStore)
            )
        )
        val socket = t.connectReady()
        if (screenOpen) {
            t.store<TerminalsStore>().openTerminalScreen(
                "t1",
                this,
                TerminalHooks({ _, _, _, _ ->
                }, {}, { submitted += it }, { _, done -> done("$ npm test\nok") })
            )
        }
        val vm = ComposerViewModel(target, t.sessions)
        backgroundScope.launch { vm.uiState.collect {} }
        testScheduler.runCurrent()
        return Setup(t, socket, vm)
    }

    private fun TestScope.type(vm: ComposerViewModel, text: String) {
        vm.input.setTextAndPlaceCursorAtEnd(text)
        Snapshot.sendApplyNotifications()
        testScheduler.runCurrent()
    }

    @Test
    fun `typing reaches the store and is mirrored to the Mac`() = runTest {
        val s = setup()
        type(s.vm, "hello")
        assertEquals("hello", s.vm.uiState.value.composer.text)
        assertTrue(s.vm.uiState.value.canSend)
        testScheduler.advanceTimeBy(300)
        testScheduler.runCurrent()
        assertEquals("hello", s.socket.sentOf("composerDraft").last().string("text"))
    }

    @Test
    fun `a send goes through the terminal, into history, and clears the field`() = runTest {
        val s = setup()
        type(s.vm, "run the tests")
        assertTrue(s.vm.send())
        testScheduler.runCurrent()
        assertEquals(listOf("run the tests"), submitted)
        assertEquals("run the tests", s.socket.sentOf("historyAdd").single().string("text"))
        assertEquals("", s.vm.input.text.toString())
        assertEquals("", s.vm.uiState.value.composer.text)
    }

    @Test
    fun `a send with no terminal on screen keeps the text and says why`() = runTest {
        val s = setup(screenOpen = false)
        type(s.vm, "keep me")
        assertFalse(s.vm.send())
        testScheduler.runCurrent()
        assertEquals(R.string.composer_not_sent, s.vm.uiState.value.sendWarning)
        assertEquals("keep me", s.vm.input.text.toString())
        s.vm.dismissWarning()
        testScheduler.runCurrent()
        assertNull(s.vm.uiState.value.sendWarning)
    }

    @Test
    fun `a draft from the Mac fills the field without echoing back`() = runTest {
        val s = setup()
        s.socket.receive(
            """{"t":"composerDraft","id":"t1","text":"from the Mac","rev":3,"origin":"mac"}"""
        )
        testScheduler.advanceTimeBy(1_000)
        testScheduler.runCurrent()
        assertEquals("from the Mac", s.vm.input.text.toString())
        assertTrue(s.socket.sentOf("composerDraft").isEmpty())
    }

    @Test
    fun `slash commands complete the fragment being typed`() = runTest {
        val s = setup()
        s.socket.receive(
            """{"t":"slash","id":"t1","commands":[{"name":"review","description":"Review a pull request"}]}"""
        )
        type(s.vm, "please /rev")
        val command = s.vm.uiState.value.slashMatches.single()
        s.vm.pickSlash(command)
        testScheduler.runCurrent()
        assertEquals("please /review ", s.vm.input.text.toString())
        assertTrue(s.vm.uiState.value.slashMatches.isEmpty())
    }

    @Test
    fun `mentions offer files and insert the picked path`() = runTest {
        val s = setup()
        s.socket.receive(
            """{"t":"mentions","project":"storefront","entries":[{"path":"app/page.tsx","changed":true}]}"""
        )
        type(s.vm, "look at @pa")
        assertTrue(s.vm.uiState.value.mentionActive)
        assertEquals(listOf("app/page.tsx"), s.vm.uiState.value.mentions.changed.map { it.path })
        s.vm.pickPath("app/page.tsx")
        testScheduler.runCurrent()
        assertEquals("look at @app/page.tsx ", s.vm.input.text.toString())
    }

    @Test
    fun `a place on another computer goes in verbatim without an at sign`() = runTest {
        val s = setup()
        s.socket.receive(
            """{"t":"mentions","project":"storefront","entries":[],""" +
                """"computers":[{"name":"Mac mini","access":"commands",""" +
                """"places":[{"label":"Home folder","path":"Mac mini:~",""" +
                """"insert":"Mac mini:~ (on another computer)"}]}]}"""
        )
        type(s.vm, "copy it to @hom")
        val place = s.vm.uiState.value.mentions.computers.single().places.single()
        assertTrue(s.vm.uiState.value.showsMentionMenu)
        s.vm.pickPlace(place)
        testScheduler.runCurrent()
        assertEquals("copy it to Mac mini:~ (on another computer) ", s.vm.input.text.toString())
    }

    @Test
    fun `branches join the mentions once a fragment is typed`() = runTest {
        val s = setup()
        s.vm.onAppear()
        testScheduler.runCurrent()
        assertEquals(1, s.socket.sentOf("gitBranches").size)
        s.socket.receive(
            """{"t":"gitBranches","ok":true,"project":"storefront","current":"main",""" +
                """"branches":[{"name":"main"},{"name":"feat/checkout","remote":"origin"}]}"""
        )
        type(s.vm, "rebase on @")
        assertTrue(s.vm.uiState.value.mentions.branches.isEmpty())
        type(s.vm, "rebase on @chec")
        val branches = s.vm.uiState.value.mentions.branches
        assertEquals(listOf("origin/feat/checkout"), branches.map { it.id })
        s.vm.pickBranch("feat/checkout")
        testScheduler.runCurrent()
        assertEquals("rebase on @feat/checkout ", s.vm.input.text.toString())
    }

    @Test
    fun `the terminal's output and a service's logs go in as context blocks`() = runTest {
        val s = setup()
        type(s.vm, "why @")
        s.vm.pickTerminalOutput()
        testScheduler.runCurrent()
        assertEquals(
            "why \n\nTerminal output:\n```\n$ npm test\nok\n```\n",
            s.vm.input.text.toString()
        )

        type(s.vm, "and @")
        s.vm.pickServiceLog(
            ServiceInfo("web", paneIndex = 0, running = true, cmd = "", port = 3000)
        )
        testScheduler.runCurrent()
        assertEquals(0, s.socket.sentOf("serviceLogs").single()["paneIndex"].toString().toInt())
        s.socket.receive(
            """{"t":"serviceLogs","project":"storefront","paneIndex":0,"ok":true,"text":"GET / 200"}"""
        )
        testScheduler.runCurrent()
        assertEquals("and \n\nweb logs:\n```\nGET / 200\n```\n", s.vm.input.text.toString())
    }

    @Test
    fun `an upload reply finds its chip through the session`() = runTest {
        val s = setup()
        s.vm.addImage(PickedUri("img:shot"))
        testScheduler.runCurrent()
        val upload = s.socket.sentOf("upload").single()
        assertEquals(SendState.Pending, s.vm.uiState.value.composer.sendState)
        s.socket.receive(
            """{"t":"upload","id":"t1","ok":true,"reqId":"${upload.string(
                "reqId"
            )}","path":"/up/shot.jpg"}"""
        )
        testScheduler.runCurrent()
        assertEquals(SendState.Ready("/up/shot.jpg"), s.vm.uiState.value.composer.sendState)
    }

    @Test
    fun `a rewrite's reply replaces the text`() = runTest {
        val s = setup()
        type(s.vm, "make it better")
        s.vm.setVariants(FREEFORM_KEY, 1)
        s.vm.startRewrite("Improve", FREEFORM_KEY)
        testScheduler.runCurrent()
        assertTrue(s.vm.uiState.value.composer.transforming)
        val reqId = s.socket.sentOf("transform").single().string("reqId")
        s.socket.receive(
            """{"t":"transform","reqId":"$reqId","idx":0,"ok":true,"text":"Make it better."}"""
        )
        s.socket.receive("""{"t":"transformDone","reqId":"$reqId","ok":true}""")
        testScheduler.runCurrent()
        assertFalse(s.vm.uiState.value.composer.transforming)
        assertEquals("Make it better.", s.vm.input.text.toString())
    }

    @Test
    fun `a reply box sends to its own destination and offers no slash commands`() = runTest {
        val replyTarget =
            ComposerTarget(
                "automation:storefront:nightly:1",
                "storefront",
                "Nightly",
                SessionKey.Live,
                terminalTools = false
            )
        val s = setup(screenOpen = false, target = replyTarget)
        assertTrue(s.socket.sentOf("slash").isEmpty())
        s.socket.receive(
            """{"t":"slash","id":"automation:storefront:nightly:1","commands":[{"name":"review"}]}"""
        )
        type(s.vm, "/re")
        assertTrue(s.vm.uiState.value.slashMatches.isEmpty())
        assertFalse(s.vm.uiState.value.memoryAvailable)

        val replies = mutableListOf<String>()
        type(s.vm, "try again with more logs")
        assertTrue(s.vm.send { replies += it })
        testScheduler.runCurrent()
        assertEquals(listOf("try again with more logs"), replies)
        assertTrue(submitted.isEmpty())
        assertNull(s.vm.uiState.value.sendWarning)
        assertEquals("", s.vm.input.text.toString())
        assertEquals(
            "automation:storefront:nightly:1",
            s.socket.sentOf("historyAdd").single().string("id")
        )
    }

    @Test
    fun `saving a draft goes to the Mac's history`() = runTest {
        val s = setup()
        type(s.vm, "later")
        s.vm.saveDraft()
        testScheduler.runCurrent()
        assertEquals("later", s.socket.sentOf("historySaveDraft").single().string("message"))
        assertEquals(R.string.composer_saved_to_drafts, s.vm.uiState.value.sendWarning)
    }
}

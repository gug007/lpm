package cx.lpm.mobile.feature.terminal.composer

import androidx.compose.foundation.text.input.setTextAndPlaceCursorAtEnd
import androidx.compose.runtime.snapshots.Snapshot
import cx.lpm.mobile.core.data.commands.LpmCommandsStore
import cx.lpm.mobile.core.data.dictation.DictationStore
import cx.lpm.mobile.core.data.git.GitStore
import cx.lpm.mobile.core.data.services.ServiceLogsStore
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.data.terminals.TerminalHooks
import cx.lpm.mobile.core.data.terminals.TerminalsStore
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
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ComposerVideoTest {
    @get:Rule
    val main = MainDispatcherRule()

    private val submitted = mutableListOf<String>()
    private val claude = ComposerTarget("t1", "storefront", "Claude", SessionKey.Live)
    private val codex = ComposerTarget("t2", "storefront", "Codex", SessionKey.Live)

    private class Setup(val t: TestSession, val socket: FakeSocket) {
        lateinit var vm: ComposerViewModel
    }

    private fun TestScope.setup(
        platform: String? = "macos",
        screenOpen: Boolean = true,
        cli: String = "claude",
        commands: String = """{"name":"review"},{"name":"explaincast","source":"user"}""",
        target: ComposerTarget = claude
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
        val mac = t.savedMac()
        val socket = t.connectReady(mac, features = listOf("lpmCommands"))
        if (platform != null) t.session.learnIdentity(mac.localId, mac.serverId, mac.name, platform)
        if (screenOpen) {
            t.store<TerminalsStore>().openTerminalScreen(
                "t1",
                this,
                TerminalHooks({ _, _, _, _ -> }, {}, { submitted += it }, { _, done -> done("") })
            )
        }
        socket.receive(
            """{"t":"terminals","project":"storefront","terminals":[""" +
                """{"id":"t1","label":"Claude","project":"storefront","cli":"$cli"},""" +
                """{"id":"t2","label":"Codex","project":"storefront","cli":"codex"}]}"""
        )
        socket.receive("""{"t":"slash","id":"t1","commands":[$commands]}""")
        socket.receive("""{"t":"slash","id":"t2","commands":[{"name":"explaincast"}]}""")
        return Setup(t, socket).also { it.vm = composer(it, target) }
    }

    private fun TestScope.composer(s: Setup, target: ComposerTarget): ComposerViewModel {
        val vm = ComposerViewModel(
            target,
            s.t.sessions,
            DictationStore(makeEngine = { FakeDictationEngine() })
        )
        backgroundScope.launch { vm.uiState.collect {} }
        testScheduler.runCurrent()
        return vm
    }

    private fun TestScope.type(vm: ComposerViewModel, text: String) {
        vm.input.setTextAndPlaceCursorAtEnd(text)
        Snapshot.sendApplyNotifications()
        testScheduler.runCurrent()
    }

    private val ComposerUiState.videoOn get() = answerKind == AnswerKind.Video
    private val ComposerUiState.video get() = answer.offers[AnswerKind.Video]
    private val ComposerUiState.generate get() = answer.offers[AnswerKind.Image]

    private fun TestScope.turnOn(vm: ComposerViewModel) {
        vm.toggleAnswer(AnswerKind.Video)
        testScheduler.runCurrent()
    }

    @Test
    fun `an agent whose commands hold the skill offers a video, off until asked for`() = runTest {
        val s = setup()
        val video = s.vm.uiState.value.video!!
        assertFalse(s.vm.uiState.value.videoOn)
        assertNull(video.offReason)

        turnOn(s.vm)
        assertTrue(s.vm.uiState.value.videoOn)
        turnOn(s.vm)
        assertFalse(s.vm.uiState.value.videoOn)
    }

    @Test
    fun `no video without the skill, without an agent, or in a reply box`() = runTest {
        assertNull(setup(commands = """{"name":"review"}""").vm.uiState.value.video)
        assertNull(setup(cli = "").vm.uiState.value.video)
        val reply = ComposerTarget("t1", "storefront", "Claude", SessionKey.Live, false)
        val box = setup(target = reply).vm
        turnOn(box)
        assertNull(box.uiState.value.video)
        assertFalse(box.uiState.value.videoOn)
    }

    @Test
    fun `a prompt sent for a video goes out as the skill's call, and the next is text again`() =
        runTest {
            val s = setup()
            turnOn(s.vm)
            type(s.vm, "How does checkout apply a coupon?")
            assertTrue(s.vm.send())
            testScheduler.runCurrent()
            val call = "/explaincast How does checkout apply a coupon?"
            assertEquals(listOf(call), submitted)
            assertEquals(call, s.socket.sentOf("historyAdd").single().string("text"))
            assertFalse(s.vm.uiState.value.videoOn)
            assertEquals("", s.vm.input.text.toString())

            type(s.vm, "thanks")
            assertTrue(s.vm.send())
            assertEquals("thanks", submitted.last())
        }

    @Test
    fun `another agent takes the skill mention, and its mode is its own`() = runTest {
        val s = setup()
        val other = composer(s, codex)
        assertNotNull(other.uiState.value.video)
        s.t.store<TerminalsStore>().openTerminalScreen(
            "t2",
            this,
            TerminalHooks({ _, _, _, _ -> }, {}, { submitted += it }, { _, done -> done("") })
        )
        turnOn(other)
        assertFalse(s.vm.uiState.value.videoOn)
        type(other, "Explain retries")
        assertTrue(other.send())
        assertEquals("\$explaincast Explain retries", submitted.single())
    }

    @Test
    fun `attachments ride inside the call, as they would have gone`() = runTest {
        val s = setup()
        turnOn(s.vm)
        s.vm.addImage(PickedUri("img:shot"))
        testScheduler.runCurrent()
        val reqId = s.socket.sentOf("upload").single().string("reqId")
        s.socket.receive(
            """{"t":"upload","id":"t1","ok":true,"reqId":"$reqId","path":"/up/shot.jpg"}"""
        )
        type(s.vm, "What is wrong here?")
        assertTrue(s.vm.send())
        assertEquals("/explaincast What is wrong here? /up/shot.jpg", submitted.single())
    }

    @Test
    fun `a video prompt isn't expanded as one of the user's lpm skills`() = runTest {
        val s = setup(
            commands = """{"name":"fix-ticket","source":"lpm"},{"name":"explaincast"}"""
        )
        turnOn(s.vm)
        type(s.vm, "/fix-ticket 123")
        assertTrue(s.vm.send())
        testScheduler.runCurrent()
        assertTrue(s.socket.sentOf("lpmCommandExpand").isEmpty())
        assertEquals("/explaincast /fix-ticket 123", submitted.single())

        type(s.vm, "/fix-ticket 123")
        assertTrue(s.vm.send())
        testScheduler.runCurrent()
        assertEquals(1, s.socket.sentOf("lpmCommandExpand").size)
    }

    @Test
    fun `a prompt that didn't go out keeps asking for a video`() = runTest {
        val s = setup(screenOpen = false)
        turnOn(s.vm)
        type(s.vm, "Explain retries")
        assertFalse(s.vm.send())
        testScheduler.runCurrent()
        assertEquals(R.string.composer_not_sent, s.vm.uiState.value.sendWarning)
        assertTrue(s.vm.uiState.value.videoOn)
        assertEquals("Explain retries", s.vm.input.text.toString())
    }

    @Test
    fun `the mode stays with its terminal while the composer is away`() = runTest {
        val s = setup()
        turnOn(s.vm)
        assertTrue(composer(s, claude).uiState.value.videoOn)
        s.vm.toggleAnswer(AnswerKind.Video)
        testScheduler.runCurrent()
        assertFalse(composer(s, claude).uiState.value.videoOn)
    }

    @Test
    fun `a computer that isn't a Mac says why it can't, and sends text`() = runTest {
        val s = setup(platform = "linux")
        turnOn(s.vm)
        val video = s.vm.uiState.value.video!!
        assertEquals(R.string.video_needs_mac, video.offReason)
        assertFalse(s.vm.uiState.value.videoOn)
        type(s.vm, "Explain retries")
        assertTrue(s.vm.send())
        assertEquals(listOf("Explain retries"), submitted)
    }

    @Test
    fun `a computer whose platform isn't known yet is taken for a Mac`() = runTest {
        val s = setup(platform = null)
        turnOn(s.vm)
        assertNull(s.vm.uiState.value.video?.offReason)
        assertTrue(s.vm.uiState.value.videoOn)
    }

    @Test
    fun `an image goes out as an ask for lpm generate, one kind at a time`() = runTest {
        val s = setup()
        val generate = s.vm.uiState.value.generate!!
        assertNull(generate.offReason)
        turnOn(s.vm)
        s.vm.toggleAnswer(AnswerKind.Image)
        testScheduler.runCurrent()
        assertEquals(AnswerKind.Image, s.vm.uiState.value.answerKind)
        assertFalse(s.vm.uiState.value.videoOn)
        type(s.vm, "A logo for the storefront")
        assertTrue(s.vm.send())
        testScheduler.runCurrent()
        assertEquals(
            "Make an image with `lpm generate image`: A logo for the storefront",
            submitted.single()
        )
        assertNull(s.vm.uiState.value.answerKind)
    }

    @Test
    fun `an image is offered wherever an agent runs, but not in a reply box`() = runTest {
        assertNotNull(setup(commands = """{"name":"review"}""").vm.uiState.value.generate)
        assertNull(setup(cli = "").vm.uiState.value.generate)
        val reply = ComposerTarget("t1", "storefront", "Claude", SessionKey.Live, false)
        assertNull(setup(target = reply).vm.uiState.value.generate)
    }

    @Test
    fun `an SSH project says why, and sends text`() = runTest {
        val s = setup()
        s.socket.receive("""{"t":"projects","projects":[{"name":"storefront","isRemote":true}]}""")
        testScheduler.runCurrent()
        assertEquals(R.string.answer_not_in_ssh, s.vm.uiState.value.generate?.offReason)
        s.vm.toggleAnswer(AnswerKind.Image)
        testScheduler.runCurrent()
        assertNull(s.vm.uiState.value.answerKind)
        type(s.vm, "A logo")
        assertTrue(s.vm.send())
        assertEquals(listOf("A logo"), submitted)
    }
}

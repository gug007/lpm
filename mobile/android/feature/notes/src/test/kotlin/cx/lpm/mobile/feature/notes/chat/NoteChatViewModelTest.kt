package cx.lpm.mobile.feature.notes.chat

import cx.lpm.mobile.core.data.dictation.DictationEngine
import cx.lpm.mobile.core.data.dictation.DictationFailure
import cx.lpm.mobile.core.data.dictation.DictationMeter
import cx.lpm.mobile.core.data.dictation.DictationResult
import cx.lpm.mobile.core.data.dictation.DictationStore
import cx.lpm.mobile.core.navigation.NoteChatKey
import cx.lpm.mobile.core.testing.MainDispatcherRule
import cx.lpm.mobile.core.testing.TestSession
import cx.lpm.mobile.core.testing.keepCollecting
import cx.lpm.mobile.feature.notes.composer.NoteFileRead
import cx.lpm.mobile.feature.notes.data.NotesStore
import cx.lpm.mobile.feature.notes.demoSession
import cx.lpm.mobile.feature.notes.notes
import cx.lpm.mobile.feature.notes.settle
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class NoteChatViewModelTest {
    private class FakeEngine : DictationEngine {
        var finished: ((DictationResult) -> Unit)? = null

        override fun start(
            meter: DictationMeter,
            heard: (String) -> Unit,
            finished: (DictationResult) -> Unit
        ): DictationFailure? {
            this.finished = finished
            return null
        }

        override fun stop() = Unit

        override fun cancel() = Unit
    }

    private val engine = FakeEngine()

    @get:Rule
    val main = MainDispatcherRule()

    private val media = FakeNoteMedia()

    private fun TestScope.chat(t: TestSession, title: String): NoteChatViewModel {
        t.notes.screenDidOpen("storefront")
        t.settle()
        val id = t.notes.state.value.chatList("storefront").first { it.title == title }.id
        val vm = NoteChatViewModel(
            NoteChatKey("storefront", id, title),
            t.sessions,
            media,
            t.clock,
            DictationStore(makeEngine = { engine })
        )
        keepCollecting(vm.uiState)
        vm.open()
        return vm
    }

    @Test
    fun `the transcript reads newest first with a capsule over each day`() = runTest {
        val t = demoSession()
        val vm = chat(t, "General")
        assertEquals(NoteChatOverlay.Loading, vm.uiState.value.overlay)
        t.settle()
        val state = vm.uiState.value
        assertEquals("General", state.title)
        assertEquals(NoteChatOverlay.None, state.overlay)
        val notes = state.items.filterIsInstance<NoteChatItem.Note>()
        assertEquals("Weekly sync moved to Wednesday.", notes.first().message.text)
        assertEquals(notes.first().message.id, state.newestId)
        // Each day's capsule comes after (above) its notes in the bottom-up list.
        assertTrue(state.items.last() is NoteChatItem.Day)
        assertEquals(4, notes.size)
        assertFalse(state.canLoadMore)
    }

    @Test
    fun `a sent note clears the composer once the Mac takes it`() = runTest {
        val t = demoSession()
        val vm = chat(t, "Ideas")
        t.settle()
        assertFalse(vm.uiState.value.canSend)
        vm.setText("Gift notes")
        assertTrue(vm.uiState.value.canSend)
        vm.send()
        assertTrue(vm.uiState.value.sending)
        assertFalse(vm.uiState.value.canSend)
        t.settle()
        val state = vm.uiState.value
        assertEquals("", state.draft.text)
        assertEquals("Gift notes", (state.items.first() as NoteChatItem.Note).message.text)
    }

    @Test
    fun `a refused note keeps what was written`() = runTest {
        val t = demoSession()
        val vm = chat(t, "Ideas")
        t.settle()
        media.files["content://x/big.bin"] = NoteFileRead.TooLarge
        media.files["content://x/a.txt"] = NoteFileRead.Bytes("hi".toByteArray())
        vm.addFiles(listOf("content://x/big.bin", "content://x/a.txt"))
        t.settle(0)
        var draft = vm.uiState.value.draft
        assertEquals(listOf("a.txt"), draft.pending.map { it.name })
        assertEquals(NotesStore.TOO_LARGE, draft.warning)
        vm.dismissWarning()
        assertNull(vm.uiState.value.draft.warning)

        vm.setText("with a file")
        t.notes.attachments.reset()
        vm.send()
        t.settle()
        draft = vm.uiState.value.draft
        assertEquals("", draft.text)
        assertTrue(draft.pending.isEmpty())
    }

    @Test
    fun `photos keep their pick order and send only once prepared`() = runTest {
        val t = demoSession()
        val vm = chat(t, "Ideas")
        t.settle()
        vm.addPhotos(listOf("content://p/1", "content://p/2", "content://p/3"))
        t.settle(0)
        var draft = vm.uiState.value.draft
        assertEquals(3, draft.pending.size)
        assertTrue(draft.encoding)
        assertFalse(vm.uiState.value.canSend)

        media.release("content://p/2", byteArrayOf(2))
        media.release("content://p/3", null)
        media.release("content://p/1", byteArrayOf(1))
        t.settle(0)
        draft = vm.uiState.value.draft
        assertEquals(listOf(1.toByte(), 2.toByte()), draft.pending.map { it.data!!.single() })
        assertEquals(listOf("photo.jpg", "photo.jpg"), draft.pending.map { it.name })
        assertTrue(vm.uiState.value.canSend)

        vm.drop(draft.pending.first().id)
        assertEquals(1, vm.uiState.value.draft.pending.size)
    }

    @Test
    fun `a camera shot drops its capture file once encoded`() = runTest {
        val t = demoSession()
        val vm = chat(t, "Ideas")
        t.settle()
        media.release("content://camera/1", byteArrayOf(7))
        vm.addCapture("content://camera/1")
        t.settle(0)
        assertEquals(listOf("content://camera/1"), media.discarded)
        assertTrue(vm.uiState.value.draft.pending.single().ready)
    }

    @Test
    fun `scrolling to the top pages older notes in`() = runTest {
        val t = demoSession()
        val vm = chat(t, "Checkout redesign")
        t.settle()
        assertTrue(vm.uiState.value.canLoadMore)
        vm.loadMore()
        t.settle()
        val state = vm.uiState.value
        assertFalse(state.canLoadMore)
        assertEquals(54, state.items.count { it is NoteChatItem.Note })
        assertTrue(state.attachments.loading.isEmpty())
    }

    @Test
    fun `dictated words join what's in the note`() = runTest {
        val t = demoSession()
        val vm = chat(t, "General")
        vm.setText("Remember")
        vm.startDictation()
        engine.finished?.invoke(DictationResult.Words("the milk"))
        testScheduler.runCurrent()
        assertEquals("Remember the milk", vm.uiState.value.draft.text)
    }
}

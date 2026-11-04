package cx.lpm.mobile.core.data.dictation

import cx.lpm.mobile.core.model.SessionKey
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DictationStoreTest {
    private class FakeEngine(val refuse: DictationFailure? = null) : DictationEngine {
        var heard: ((String) -> Unit)? = null
        var finished: ((DictationResult) -> Unit)? = null
        var stopped = false
        var cancelled = false

        override fun start(
            meter: DictationMeter,
            heard: (String) -> Unit,
            finished: (DictationResult) -> Unit
        ): DictationFailure? {
            this.heard = heard
            this.finished = finished
            return refuse
        }

        override fun stop() {
            stopped = true
        }

        override fun cancel() {
            cancelled = true
        }
    }

    private var clock = 1_000L
    private val engines = mutableListOf<FakeEngine>()
    private val sessions = mutableListOf<SessionKey>()
    private var refuse: DictationFailure? = null
    private val store = DictationStore(
        makeEngine = { session ->
            sessions += session
            FakeEngine(refuse).also { engines += it }
        },
        now = { clock }
    )
    private val inserted = mutableListOf<String>()

    private fun start(owner: String = "a", session: SessionKey = SessionKey.Live) =
        store.start(owner, session) { inserted += it }

    @Test
    fun `a take goes to the Mac of the screen that started it`() {
        val visit = SessionKey.Visit("other-mac")
        start(session = visit)
        assertEquals(listOf<SessionKey>(visit), sessions)
    }

    @Test
    fun `a take records, then its words go to the field that started it`() {
        start()
        assertTrue(store.state.value.isActive("a"))
        assertTrue(!store.state.value.isActive("b"))
        store.stop()
        assertEquals(DictationPhase.Transcribing, store.state.value.phase)
        assertTrue(engines.single().stopped)
        engines.single().finished?.invoke(DictationResult.Words("hello"))
        assertEquals(listOf("hello"), inserted)
        assertEquals(DictationState(), store.state.value)
    }

    @Test
    fun `words show as they're heard, for their field only, until they land`() {
        start()
        engines.single().heard?.invoke("run the")
        assertEquals("run the", store.state.value.words("a"))
        assertEquals("", store.state.value.words("b"))
        store.stop()
        engines.single().heard?.invoke("run the tests")
        assertEquals("run the tests", store.state.value.words("a"))
        engines.single().finished?.invoke(DictationResult.Words("run the tests"))
        assertEquals(listOf("run the tests"), inserted)
        assertEquals("", store.state.value.heard)
    }

    @Test
    fun `cancelling drops the words on show`() {
        start()
        engines.single().heard?.invoke("run the")
        store.cancel()
        assertEquals("", store.state.value.heard)
        assertTrue(inserted.isEmpty())
    }

    @Test
    fun `a cancelled take's late words don't reach the next one`() {
        start()
        val first = engines.single()
        store.cancel()
        start()
        first.heard?.invoke("old words")
        assertEquals("", store.state.value.heard)
    }

    @Test
    fun `the take length holds at stop`() {
        start()
        clock += 7_000
        store.stop()
        assertEquals(7_000L, store.state.value.lengthMs)
    }

    @Test
    fun `a second start during a take does nothing`() {
        start("a")
        start("b")
        assertEquals("a", store.state.value.owner)
        assertEquals(1, engines.size)
    }

    @Test
    fun `cancelling drops the words even if they arrive late`() {
        start()
        val engine = engines.single()
        store.stop()
        store.cancel()
        assertTrue(engine.cancelled)
        engine.finished?.invoke(DictationResult.Words("late"))
        assertTrue(inserted.isEmpty())
        assertEquals(DictationPhase.Idle, store.state.value.phase)
    }

    @Test
    fun `a failed take shows its notice in that field only`() {
        start("a")
        engines.single().finished?.invoke(DictationResult.Failed(DictationFailure.NoSpeech))
        assertEquals(DictationFailure.NoSpeech, store.state.value.failure("a"))
        assertNull(store.state.value.failure("b"))
        assertTrue(!store.state.value.isActive("a"))
    }

    @Test
    fun `an engine that can't start fails straight away, and the mic can try again`() {
        refuse = DictationFailure.Unavailable
        start()
        assertEquals(DictationFailure.Unavailable, store.state.value.failure("a"))
        refuse = null
        start()
        assertTrue(store.state.value.isActive("a"))
    }

    @Test
    fun `the mic ignores taps just after a send`() {
        store.noteSent()
        clock += 500
        start()
        assertTrue(engines.isEmpty())
        clock += 200
        start()
        assertEquals(1, engines.size)
    }

    @Test
    fun `leaving the screen finishes a take and clears a notice`() {
        start()
        store.leave("other")
        assertTrue(!engines.single().stopped)
        store.leave("a")
        assertTrue(engines.single().stopped)
        store.cancel()

        store.refuse("a")
        assertEquals(DictationFailure.Denied, store.state.value.failure("a"))
        store.leave("a")
        assertEquals(DictationState(), store.state.value)
    }

    @Test
    fun `abandoning a take throws its words away`() {
        start()
        store.abandon("a")
        assertTrue(engines.single().cancelled)
        assertEquals(DictationState(), store.state.value)
    }
}

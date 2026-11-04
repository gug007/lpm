package cx.lpm.mobile.core.data.dictation

import cx.lpm.mobile.core.model.DictationEvent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ComputerDictationEngineTest {
    private class FakeMicrophone(val opens: Boolean = true) : DictationMicrophone {
        var onPiece: ((String) -> Unit)? = null
        var closed = false

        override fun open(meter: DictationMeter, onPiece: (String) -> Unit): Boolean {
            this.onPiece = onPiece
            return opens
        }

        override fun close() {
            closed = true
        }
    }

    private val sent = mutableListOf<JsonObject>()
    private val posted = ArrayDeque<() -> Unit>()
    private val heard = mutableListOf<String>()
    private var result: DictationResult? = null
    private val microphone = FakeMicrophone()

    private fun engine(scope: CoroutineScope, mic: DictationMicrophone = microphone) =
        ComputerDictationEngine(
            send = { sent += Json.parseToJsonElement(it) as JsonObject },
            post = { posted.addLast(it) },
            scope = scope,
            microphone = mic
        )

    private fun ComputerDictationEngine.begin() =
        start(DictationMeter(), { heard += it }, { result = it })

    private fun runPosted() {
        while (posted.isNotEmpty()) posted.removeFirst()()
    }

    private val frames: List<String> get() = sent.map { it.getValue("t").jsonPrimitive.content }
    private val take: String get() = sent.first().getValue("id").jsonPrimitive.content

    private fun event(kind: String, text: String = "", code: String = "", message: String = "") =
        DictationEvent(take, kind, text, code, message)

    @Test
    fun `audio goes out in order and Stop can't pass what's still queued`() = runTest {
        val engine = engine(backgroundScope)
        assertNull(engine.begin())
        microphone.onPiece?.invoke("one")
        microphone.onPiece?.invoke("two")
        engine.stop()
        assertTrue(microphone.closed)
        assertEquals(listOf("dictateStart"), frames)
        runPosted()
        assertEquals(listOf("dictateStart", "dictateAudio", "dictateAudio", "dictateStop"), frames)
        assertEquals("one", sent[1].getValue("pcm").jsonPrimitive.content)
        assertEquals("two", sent[2].getValue("pcm").jsonPrimitive.content)
    }

    @Test
    fun `the transcript is the take's result, and live words show on the way`() = runTest {
        val engine = engine(backgroundScope)
        engine.begin()
        engine.apply(event("partial", text = "run the"))
        engine.stop()
        engine.apply(event("transcript", text = "Run the tests."))
        assertEquals(listOf("run the"), heard)
        assertEquals(DictationResult.Words("Run the tests."), result)
    }

    @Test
    fun `nothing said is a retry, and the Mac's own refusal is shown as it wrote it`() = runTest {
        val quiet = engine(backgroundScope)
        quiet.begin()
        quiet.apply(event("error", code = "no_speech", message = "No speech detected."))
        assertEquals(DictationResult.Failed(DictationFailure.NoSpeech), result)

        sent.clear()
        val busy = engine(backgroundScope)
        busy.begin()
        busy.apply(event("error", code = "busy", message = "VoiceToText is already recording."))
        assertEquals(
            DictationResult.Failed(DictationFailure.Computer("VoiceToText is already recording.")),
            result
        )
        assertTrue(DictationFailure.Computer("").canRetry)
    }

    @Test
    fun `a dropped link ends the take and keeps the words it showed`() = runTest {
        val silent = engine(backgroundScope)
        silent.begin()
        silent.linkLost()
        assertEquals(
            DictationResult.Failed(DictationFailure.Computer("Lost the connection to your Mac.")),
            result
        )
        assertTrue(microphone.closed)

        sent.clear()
        val live = engine(backgroundScope)
        live.begin()
        live.apply(event("partial", text = "run the tests"))
        live.linkLost()
        assertEquals(DictationResult.Words("run the tests"), result)
    }

    @Test
    fun `a cancelled take tells the Mac and sends nothing that was still queued`() = runTest {
        val engine = engine(backgroundScope)
        engine.begin()
        microphone.onPiece?.invoke("late")
        engine.cancel()
        runPosted()
        assertEquals(listOf("dictateStart", "dictateCancel"), frames)
        engine.apply(event("transcript", text = "too late"))
        assertNull(result)
    }

    @Test
    fun `another take's answer is ignored`() = runTest {
        val engine = engine(backgroundScope)
        engine.begin()
        engine.apply(DictationEvent("old-take", "transcript", "stale", "", ""))
        assertNull(result)
    }

    @Test
    fun `a mic that won't open takes the take back`() = runTest {
        val engine = engine(backgroundScope, FakeMicrophone(opens = false))
        assertEquals(DictationFailure.Unavailable, engine.begin())
        assertEquals(listOf("dictateStart", "dictateCancel"), frames)
        engine.apply(event("transcript", text = "unwanted"))
        assertNull(result)
    }

    @Test
    fun `a lost answer ends the wait, and any word from the Mac extends it`() = runTest {
        val engine = engine(backgroundScope)
        engine.begin()
        engine.stop()
        advanceBy(this, 299_000)
        engine.apply(event("state"))
        advanceBy(this, 299_000)
        assertNull(result)
        advanceBy(this, 2_000)
        assertEquals(
            DictationResult.Failed(
                DictationFailure.Computer("Your Mac didn't send the words back.")
            ),
            result
        )
    }

    private fun advanceBy(scope: TestScope, millis: Long) {
        scope.advanceTimeBy(millis)
        scope.runCurrent()
    }
}

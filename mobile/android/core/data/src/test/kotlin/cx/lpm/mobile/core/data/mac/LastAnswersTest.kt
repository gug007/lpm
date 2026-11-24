package cx.lpm.mobile.core.data.mac

import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class LastAnswersTest {
    @get:Rule
    val folder = TemporaryFolder()

    private val file by lazy { File(folder.root, "cache/agent-answers.json") }

    private fun LastAnswers.record(mac: String, terminal: String, text: String, at: Long) =
        record(mac, mapOf(terminal to LastAnswer(text, at)))

    private fun push(json: String) = Json.parseToJsonElement(json).jsonObject

    @Test
    fun `the newest answer of each tab is kept across launches`() {
        LastAnswers(file).apply {
            record("mac", "t1", " first ", 10)
            record("mac", "t1", "older", 5)
            record("mac", "t1", "second", 20)
            record("other", "t1", "theirs", 1)
            record("mac", "t2", "  ", 30)
        }
        val read = LastAnswers(file)
        assertEquals(mapOf("t1" to LastAnswer("second", 20)), read.load("mac"))
        assertEquals("theirs", read.load("other")["t1"]?.text)
    }

    @Test
    fun `a finish's push brings its answer`() {
        val answers = LastAnswers(file)
        answers.apply(
            push(
                """{"serverId":"mac","target":"terminal","terminalId":"t1","answer":"Done.","ts":9}"""
            )
        )
        answers.apply(push("""{"serverId":"mac","terminalId":"t2","status":"Waiting","ts":9}"""))
        answers.apply(
            push(
                """{"serverId":"mac","target":"automation","terminalId":"t3","answer":"x","ts":9}"""
            )
        )
        assertEquals(setOf("t1"), answers.load("mac").keys)
    }

    @Test
    fun `a push's cut answer gives way to the whole one of the same turn`() {
        val answers = LastAnswers(file)
        answers.record("mac", "t1", "whole", 8)
        answers.apply(
            push("""{"serverId":"mac","terminalId":"t1","answer":"cut…","ts":9}""")
        )
        assertEquals(LastAnswer("cut…", 9, partial = true), LastAnswers(file).load("mac")["t1"])
        assertTrue(answers.load("mac").getValue("t1").lacks(9))
        answers.record("mac", "t1", "cut no more", 9)
        assertEquals(LastAnswer("cut no more", 9), answers.load("mac")["t1"])
        answers.apply(
            push("""{"serverId":"mac","terminalId":"t1","answer":"cut…","ts":9}""")
        )
        assertEquals("cut no more", answers.load("mac")["t1"]?.text)
    }

    @Test
    fun `an unpaired mac's answers are gone`() {
        val answers = LastAnswers(file)
        answers.record("mac", "t1", "a", 1)
        answers.record("other", "t1", "b", 1)
        answers.keep(setOf("other"))
        assertTrue(answers.load("mac").isEmpty())
        assertFalse(LastAnswers(file).load("other").isEmpty())
    }

    @Test
    fun `only the newest tabs are kept, and a broken file reads as none`() {
        val answers = LastAnswers(file)
        repeat(70) { answers.record("mac", "t$it", "a", 1L + it) }
        val kept = answers.load("mac")
        assertEquals(60, kept.size)
        assertFalse("t0" in kept)
        file.writeText("{")
        assertTrue(LastAnswers(file).load("mac").isEmpty())
    }
}

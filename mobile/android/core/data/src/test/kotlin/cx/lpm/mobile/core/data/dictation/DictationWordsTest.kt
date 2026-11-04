package cx.lpm.mobile.core.data.dictation

import org.junit.Assert.assertEquals
import org.junit.Test

class DictationWordsTest {
    @Test
    fun `dictated words follow a draft the way typing would`() {
        assertEquals("run", "".plusDictated("run"))
        assertEquals("fix it run", "fix it".plusDictated("run"))
        assertEquals("fix it run", "fix it ".plusDictated("run"))
        assertEquals("fix it\nrun", "fix it\n".plusDictated("run"))
    }

    @Test
    fun `partial text stands in until the result arrives`() {
        val words = DictationWords()
        words.hear("run the")
        assertEquals("run the", words.text)
        words.settle("run the tests")
        assertEquals("run the tests", words.text)
    }

    @Test
    fun `each recognition follows the last`() {
        val words = DictationWords()
        words.settle("run the tests")
        words.hear("then")
        words.settle("then fix them")
        assertEquals("run the tests then fix them", words.text)
    }

    @Test
    fun `a recognition cut off without a result keeps its partial text`() {
        val words = DictationWords()
        words.hear("run the tests")
        words.settle(null)
        assertEquals("run the tests", words.text)
    }

    @Test
    fun `silence adds nothing`() {
        val words = DictationWords()
        words.settle("hello")
        words.settle(null)
        words.settle("")
        assertEquals("hello", words.text)
    }
}

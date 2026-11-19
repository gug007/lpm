package cx.lpm.mobile.feature.settings.help

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FeedbackDraftTest {
    @Test
    fun `the kind follows what the text reads like`() {
        assertNull(FeedbackDraft.guessKind("   "))
        assertEquals(FeedbackKind.Bug, FeedbackDraft.guessKind("The terminal crashes on rotate"))
        assertEquals(FeedbackKind.Bug, FeedbackDraft.guessKind("Push doesn’t work after a rebase"))
        assertEquals(
            FeedbackKind.Suggestion,
            FeedbackDraft.guessKind("It would be nice to pin tabs")
        )
        assertEquals(FeedbackKind.Question, FeedbackDraft.guessKind("How do I pair a second Mac?"))
        assertEquals(FeedbackKind.Suggestion, FeedbackDraft.guessKind("Thanks for lpm"))
    }

    @Test
    fun `the title is the first sentence, cut at a word near 80 characters`() {
        assertEquals("Tabs vanish", FeedbackDraft.title("Tabs vanish. Then the app hangs.\nMore"))
        val long = "word ".repeat(30).trim()
        val title = FeedbackDraft.title(long)
        assertTrue(title.endsWith("…"))
        assertTrue(title.length <= 81)
        assertTrue(!title.dropLast(1).endsWith(" "))
    }

    @Test
    fun `bugs open an issue and the rest a discussion, everything escaped`() {
        assertEquals(
            "https://github.com/gug007/lpm/issues/new?title=a%2Bb&body=x%20y%0A&labels=bug",
            FeedbackDraft.url(FeedbackKind.Bug, "a+b", "x y\n")
        )
        assertEquals(
            "https://github.com/gug007/lpm/discussions/new?category=q-a&title=%C3%A9&body=",
            FeedbackDraft.url(FeedbackKind.Question, "é", "")
        )
        assertTrue(FeedbackDraft.url(FeedbackKind.Suggestion, "t", "b").contains("category=ideas"))
    }
}

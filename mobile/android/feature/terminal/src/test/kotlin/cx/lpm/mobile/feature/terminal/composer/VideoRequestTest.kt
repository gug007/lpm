package cx.lpm.mobile.feature.terminal.composer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The same cases as the desktop's `videoRequest.test.ts`, so every screen sends the same call. */
class VideoRequestTest {
    @Test
    fun `calls the skill with the prompt as written`() {
        assertEquals(
            "/explaincast How does checkout apply a coupon?",
            VideoRequest.build("claude", "How does checkout apply a coupon?")
        )
    }

    @Test
    fun `uses the skill mention for every agent but Claude Code`() {
        assertEquals(
            "\$explaincast Show the signup flow",
            VideoRequest.build("codex", "Show the signup flow")
        )
        assertTrue(VideoRequest.build("", "Show the signup flow").startsWith("\$explaincast "))
    }

    @Test
    fun `keeps a prompt of several lines whole`() {
        assertEquals(
            "/explaincast Show checkout.\nThen the refund.",
            VideoRequest.build("claude", "  Show checkout.\nThen the refund.  ")
        )
    }

    @Test
    fun `leaves a prompt that already calls the skill alone`() {
        assertEquals(
            "/explaincast Explain retries",
            VideoRequest.build("claude", "/explaincast Explain retries")
        )
        assertEquals(
            "\$explaincast Explain retries",
            VideoRequest.build("codex", "\$explaincast Explain retries")
        )
        assertEquals(
            "/explaincast /explaincasting is fun",
            VideoRequest.build("claude", "/explaincasting is fun")
        )
    }
}

package cx.lpm.mobile.feature.terminal.composer

import org.junit.Assert.assertEquals
import org.junit.Test

class ImageRequestTest {
    @Test
    fun `asks for the image with lpm generate, with the prompt as written`() {
        assertEquals(
            "Make an image with `lpm generate image`: A banana in a spacesuit",
            ImageRequest.build("  A banana in a spacesuit \n")
        )
    }

    @Test
    fun `leaves a prompt that already asks alone`() {
        val asked = "Make an image with `lpm generate image`: A logo"
        assertEquals(asked, ImageRequest.build(asked))
    }
}

package cx.lpm.mobile.feature.share

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SharedItemsTest {
    private val image = byteArrayOf(1)

    @Test
    fun aLoneWebAddressIsALinkAndRepeatsAreDropped() {
        val items = SharedItems()
            .adding("  https://example.com/post \n")
            .adding("https://example.com/post")
            .adding("Look at this https://example.com/post")
            .adding("Look at this https://example.com/post")
            .adding("ftp://example.com/file")
            .adding("   ")
        assertEquals(listOf("https://example.com/post"), items.links)
        assertEquals(
            listOf("Look at this https://example.com/post", "ftp://example.com/file"),
            items.texts
        )
        assertEquals(
            "Look at this https://example.com/post\n\nftp://example.com/file\n\nhttps://example.com/post",
            items.text
        )
    }

    @Test
    fun theHeadlineIsTheTitleThenTheHostThenTheFirstLine() {
        val link = SharedItems().adding("https://news.example.com/story")
        assertEquals("news.example.com", link.headline)
        assertEquals("https://news.example.com/story", link.detailLink)
        assertFalse(link.detailCountsImages)

        val titled = link.copy(title = "A story")
        assertEquals("A story", titled.headline)
        assertEquals("https://news.example.com/story", titled.detailLink)

        val text = SharedItems().adding("Buy milk\nand eggs")
        assertEquals("Buy milk", text.headline)
        assertNull(text.detailLink)
    }

    @Test
    fun imagesAloneAreCountedAndBesideAnythingElseInTheDetail() {
        val photos = SharedItems(images = listOf(image, image))
        assertNull(photos.headline)
        assertFalse(photos.detailCountsImages)
        assertFalse(photos.isEmpty)

        val captioned = photos.adding("Our new office")
        assertEquals("Our new office", captioned.headline)
        assertTrue(captioned.detailCountsImages)
        assertTrue(SharedItems().isEmpty)
    }
}

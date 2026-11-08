package cx.lpm.mobile.feature.share

import android.content.Intent
import android.net.Uri
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class SharedInputTest {
    @Test
    fun aLinkComesWithThePageTitleItsAppGave() {
        val intent = Intent(Intent.ACTION_SEND)
            .setType("text/plain")
            .putExtra(Intent.EXTRA_TEXT, "https://example.com/post")
            .putExtra(Intent.EXTRA_SUBJECT, "A post")
        assertEquals(
            SharedInput(texts = listOf("https://example.com/post"), title = "A post"),
            intent.sharedInput()
        )
    }

    @Test
    fun severalImagesComeAsStreams() {
        val photos = arrayListOf(Uri.parse("content://photos/1"), Uri.parse("content://photos/2"))
        val intent = Intent(Intent.ACTION_SEND_MULTIPLE)
            .setType("image/*")
            .putParcelableArrayListExtra(Intent.EXTRA_STREAM, photos)
        assertEquals(
            SharedInput(streams = listOf("content://photos/1", "content://photos/2")),
            intent.sharedInput()
        )
    }
}

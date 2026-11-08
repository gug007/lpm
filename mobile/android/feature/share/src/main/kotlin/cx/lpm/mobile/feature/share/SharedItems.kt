package cx.lpm.mobile.feature.share

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.ImageBitmap
import cx.lpm.mobile.core.model.PendingShare
import cx.lpm.mobile.core.model.trimmingWhitespace
import java.net.URI
import java.net.URISyntaxException

/** What the other app's intent carried: its text, its streams and the title it gave. */
data class SharedInput(
    val texts: List<String> = emptyList(),
    val streams: List<String> = emptyList(),
    val title: String? = null
)

/**
 * What another app shared (iOS `SharedItems`): its links, text and images, read once.
 * Text that is a single web address counts as a link, and text that repeats a link is
 * dropped.
 */
@Immutable
data class SharedItems(
    val links: List<String> = emptyList(),
    val texts: List<String> = emptyList(),
    /** Each image as it goes to the Mac: a JPEG at most 2048 px on its longer side. */
    val images: List<ByteArray> = emptyList(),
    /** The first image, small, for the row. */
    val thumbnail: ImageBitmap? = null,
    /** The page title the other app gave the link, when it gave one. */
    val title: String? = null
) {
    val isEmpty: Boolean get() = links.isEmpty() && texts.isEmpty() && images.isEmpty()

    /** The links and text as the prompt's or note's paragraphs. */
    val text: String get() = PendingShare.paragraphs(texts + links)

    /**
     * The row's headline: the title, else the link's host, else the text's first line;
     * null when only images came, which the row counts instead.
     */
    val headline: String?
        get() = title?.takeIf(String::isNotEmpty)
            ?: links.firstOrNull()?.let { host(it) ?: it }
            ?: texts.firstOrNull()?.split("\n")?.firstOrNull(String::isNotEmpty)

    /** The link under a headline that isn't the link itself. */
    val detailLink: String?
        get() = links.firstOrNull()?.takeIf { !title.isNullOrEmpty() || host(it) != null }

    /** Whether the detail line counts the images, as it does under any other headline. */
    val detailCountsImages: Boolean
        get() = images.isNotEmpty() && (title != null || links.isNotEmpty() || texts.isNotEmpty())

    /** With [text] as a link or a paragraph, unless it's empty or already here. */
    fun adding(text: String): SharedItems {
        val trimmed = text.trimmingWhitespace()
        if (trimmed.isEmpty() || trimmed in links || trimmed in texts) return this
        if (isWebLink(trimmed)) return copy(links = links + trimmed)
        return copy(texts = texts + trimmed)
    }

    companion object {
        /** iOS takes up to five images from the share sheet. */
        const val MAX_IMAGES = 5

        private fun uri(text: String): URI? = try {
            URI(text)
        } catch (e: URISyntaxException) {
            null
        }

        private fun host(link: String): String? = uri(link)?.host

        private fun isWebLink(text: String): Boolean =
            ' ' !in text && uri(text)?.scheme?.startsWith("http") == true
    }
}

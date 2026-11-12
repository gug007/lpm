package cx.lpm.mobile.feature.files.fetch

import cx.lpm.mobile.feature.files.fetch.FilePreviewKind.Document
import cx.lpm.mobile.feature.files.fetch.FilePreviewKind.Markdown
import cx.lpm.mobile.feature.files.fetch.FilePreviewKind.Media
import cx.lpm.mobile.feature.files.fetch.FilePreviewKind.Text
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FilePreviewKindTest {
    private val text = "export const a = 1\n".toByteArray()
    private val binary = byteArrayOf(0x47, 0x40, 0x11, 0x10, 0x00, 0x42)

    private fun kind(name: String, head: ByteArray) =
        FilePreviewKind.classify(name, head, TEST_MIME[pathExtension(name).lowercase()])

    @Test
    fun `Markdown by its extension, any other text is text`() {
        assertEquals(Markdown, kind("README.md", text))
        assertEquals(Markdown, kind("docs/Guide.MARKDOWN", text))
        assertEquals(Markdown, kind("page.mdx", text))
        assertEquals(Text, kind("Makefile", text))
        assertEquals(Text, kind("app/page.tsx", text))
        assertEquals(Text, kind(".env", text))
    }

    @Test
    fun `content wins over the extension, except for images and PDFs`() {
        assertEquals("TypeScript, not a transport stream", Text, kind("index.ts", text))
        assertEquals(Media, kind("clip.ts", binary))
        assertEquals(Media, kind("clip.mp4", binary))
        assertEquals("an SVG is text but still an image", Document, kind("logo.svg", text))
        assertEquals(Document, kind("shot.png", binary))
        assertEquals(Document, kind("spec.pdf", text))
        assertEquals(Document, kind("archive.zip", binary))
    }

    @Test
    fun `text is NUL-free UTF-8, forgiving a character cut at the end`() {
        assertTrue(FilePreviewKind.looksLikeText(ByteArray(0)))
        assertTrue(FilePreviewKind.looksLikeText("héllo — ✓".toByteArray()))
        val cut = "ab✓".toByteArray().dropLast(1).toByteArray()
        assertTrue(FilePreviewKind.looksLikeText(cut))
        assertFalse(FilePreviewKind.looksLikeText(byteArrayOf(0x61, 0x00, 0x62)))
        val invalid = "a".toByteArray() + 0xFF.toByte() + "bcdef".toByteArray()
        assertFalse(FilePreviewKind.looksLikeText(invalid))
    }

    @Test
    fun `a text file in an older encoding still opens as text`() {
        val latin1 = "café\nline two\n".toByteArray(Charsets.ISO_8859_1)
        assertEquals(Text, kind("legacy.txt", latin1))
        assertEquals("the name doesn't say text", Document, kind("legacy.bin", latin1))
        assertEquals("café\nline two\n", FilePreviewKind.decode(latin1))
        assertEquals("café ✓", FilePreviewKind.decode("café ✓".toByteArray()))
    }

    @Test
    fun `only the first 8 KB are sampled`() {
        val head = ByteArray(8192) { 'a'.code.toByte() } + byteArrayOf(0)
        assertTrue(FilePreviewKind.looksLikeText(head))
    }

    @Test
    fun `names and extensions read like NSString's`() {
        assertEquals("page.tsx", lastPathComponent("app/checkout/page.tsx"))
        assertEquals("checkout", lastPathComponent("app/checkout/"))
        assertEquals("/", lastPathComponent("/"))
        assertEquals("", lastPathComponent(""))
        assertEquals("tsx", pathExtension("app/page.tsx"))
        assertEquals("gz", pathExtension("a.tar.gz"))
        assertEquals("", pathExtension(".bashrc"))
        assertEquals("", pathExtension("v1.2/Makefile"))
    }
}

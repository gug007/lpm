package cx.lpm.mobile.feature.files.preview

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FileEditTest {
    @Test
    fun `a UTF-8 file opens with the hash a save is checked against`() {
        val file = File.createTempFile("edit", ".ts").apply { writeText("const a = \"é\";\n") }
        val opened = FileEdit.open(file)
        assertFalse(opened.unreadable)
        assertEquals("const a = \"é\";\n", opened.text)
        assertEquals(FileEdit.sha256(file.readBytes()), opened.base)
        assertEquals(
            "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
            FileEdit.sha256("hello".toByteArray())
        )
        file.delete()
    }

    @Test
    fun `bytes that aren't UTF-8 can't be edited`() {
        assertNull(FileEdit.decode(byteArrayOf(0xC3.toByte(), 0x28)))
        val file = File.createTempFile("edit", ".bin").apply {
            writeBytes(byteArrayOf(0xFF.toByte(), 0xFE.toByte()))
        }
        assertTrue(FileEdit.open(file).unreadable)
        file.delete()
    }
}

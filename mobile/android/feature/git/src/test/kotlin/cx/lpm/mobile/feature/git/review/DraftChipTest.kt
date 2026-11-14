package cx.lpm.mobile.feature.git.review

import cx.lpm.mobile.core.model.GitFile
import cx.lpm.mobile.feature.git.data.CommitDraft
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DraftChipTest {
    private val files = listOf(
        GitFile("src/app.ts", "modified", staged = false, stamp = "1"),
        GitFile("assets/logo.png", "added", staged = false, stamp = "1")
    )

    @Test
    fun `nothing written and nothing left out is no draft`() {
        assertNull(draftChip(CommitDraft(message = " \n\t"), files))
    }

    @Test
    fun `the first line that isn't empty, untrimmed`() {
        val chip = draftChip(CommitDraft(message = "\r\n  fix: x\nbody"), files)
        assertEquals(DraftChip("  fix: x", emptyList()), chip)
    }

    @Test
    fun `a blank first line shows only what's left out`() {
        val chip =
            draftChip(CommitDraft(message = "   \nbody", deselected = setOf("src/app.ts")), files)
        assertEquals(DraftChip(null, listOf("app.ts")), chip)
    }

    @Test
    fun `files that left the changes aren't counted`() {
        val chip = draftChip(CommitDraft(deselected = setOf("gone.ts", "assets/logo.png")), files)
        assertEquals(DraftChip(null, listOf("logo.png")), chip)
    }
}

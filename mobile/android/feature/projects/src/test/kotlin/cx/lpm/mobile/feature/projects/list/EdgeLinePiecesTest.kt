package cx.lpm.mobile.feature.projects.list

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class EdgeLinePiecesTest {
    private fun gaps(pieces: List<EdgePiece>) = pieces.zipWithNext { a, b -> b.start - a.end }

    @Test
    fun `one agent fills the line`() {
        assertEquals(listOf(EdgePiece(0f, 300f)), edgeLinePieces(count = 1, width = 300f, gap = 4f))
    }

    @Test
    fun `pieces share the line evenly up to five`() {
        val pieces = edgeLinePieces(count = 5, width = 316f, gap = 4f)
        assertEquals(List(5) { 60f }, pieces.map { it.end - it.start })
        assertEquals(List(4) { 4f }, gaps(pieces))
        assertEquals(316f, pieces.last().end)
    }

    @Test
    fun `a wider gap follows every fifth piece`() {
        val pieces = edgeLinePieces(count = 12, width = 391f, gap = 4f)
        assertEquals(12, pieces.size)
        assertEquals(
            listOf(4, 9),
            gaps(pieces).withIndex().filter {
                it.value > 6f
            }.map { it.index }
        )
        assertEquals(setOf(4f, 12f), gaps(pieces).toSet())
        assertEquals(391f, pieces.last().end)
    }

    @Test
    fun `pieces land on whole pixels`() {
        val pieces = edgeLinePieces(count = 7, width = 1011f, gap = 5f)
        assertTrue(pieces.all { it.start % 1f == 0f && it.end % 1f == 0f })
    }

    @Test
    fun `pieces past the end are left off`() {
        val pieces = edgeLinePieces(count = 200, width = 300f, gap = 4f)
        assertTrue(pieces.size < 200)
        assertTrue(pieces.all { it.end <= 300f })
    }

    @Test
    fun `no agents, no pieces`() {
        assertEquals(emptyList<EdgePiece>(), edgeLinePieces(count = 0, width = 300f, gap = 4f))
    }
}

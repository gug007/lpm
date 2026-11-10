package cx.lpm.mobile.core.designsystem.component

import cx.lpm.mobile.core.designsystem.component.MarkdownBlock.Kind
import org.junit.Assert.assertEquals
import org.junit.Test

class MarkdownBlockTest {
    private fun kinds(source: String) = MarkdownBlock.parse(source).map { it.kind to it.text }

    @Test
    fun headingsParagraphsAndRules() {
        assertEquals(
            listOf(
                Kind.Heading(1) to "Summary",
                Kind.Paragraph to "First line\nsecond line",
                Kind.Rule to "",
                Kind.Heading(3) to "Next",
                Kind.Paragraph to "#hashtag stays text"
            ),
            kinds("# Summary\nFirst line\n  second line\n\n---\n### Next\n#hashtag stays text")
        )
    }

    @Test
    fun listsKeepTheirMarkersAndDepth() {
        assertEquals(
            listOf(
                Kind.ListItem("•", 0) to "one",
                Kind.ListItem("•", 1) to "nested",
                Kind.ListItem("12.", 0) to "twelfth",
                Kind.Paragraph to "-not a bullet"
            ),
            kinds("- one\n  * nested\n12. twelfth\n-not a bullet")
        )
    }

    @Test
    fun fencesSwallowEverythingUpToTheirClose() {
        val blocks = MarkdownBlock.parse(
            "Before\n```kotlin\n# not a heading\n\n- nor a list\n```\nAfter"
        )
        assertEquals(
            listOf(
                Kind.Paragraph to "Before",
                Kind.Code(wraps = false) to "# not a heading\n\n- nor a list",
                Kind.Paragraph to "After"
            ),
            blocks.map { it.kind to it.text }
        )
        assertEquals(listOf(0, 1, 2), blocks.map { it.id })
        assertEquals(Kind.Code(wraps = true) to "left open", kinds("~~~\nleft open").single())
    }

    @Test
    fun aFenceOfWordsWrapsAndCodeKeepsItsLines() {
        assertEquals(
            Kind.Code(wraps = true),
            kinds("```\nSorry for the slow reply.\n```").single().first
        )
        assertEquals(Kind.Code(wraps = true), kinds("``` text\nSorry.\n```").single().first)
        assertEquals(Kind.Code(wraps = false), kinds("```ts\nconst a = 1\n```").single().first)
    }
}

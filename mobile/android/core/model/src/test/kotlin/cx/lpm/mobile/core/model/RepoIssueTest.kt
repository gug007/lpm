package cx.lpm.mobile.core.model

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RepoIssueTest {
    private fun obj(json: String): JsonObject = Json.parseToJsonElement(json).jsonObject

    private fun issue(number: Int, title: String, vararg labels: String) =
        RepoIssue(number, title, labels.toList())

    private val issues = listOf(
        issue(45, "Cart badge keeps the old count", "bug"),
        issue(38, "Split checkout into two steps"),
        issue(5, "Show delivery dates")
    )

    @Test
    fun `an issue is found by number, with or without the hash, or by its title`() {
        fun found(fragment: String) = issues.matching(fragment).map { it.number }
        assertEquals(listOf(45, 38, 5), found(""))
        assertEquals(listOf(45, 5), found("5"))
        assertEquals(listOf(5), found("#5"))
        assertEquals(listOf(38), found("CHECKOUT"))
        assertEquals("a label isn't searched, as on the desktop", emptyList<Int>(), found("bug"))
    }

    @Test
    fun `a bare at sign shows only the newest few`() {
        val many = (30 downTo 1).map { issue(it, "Issue") }
        assertEquals(listOf(30, 29, 28, 27, 26), many.matching("").map { it.number })
        assertEquals(20, many.matching("issue").size)
    }

    @Test
    fun `an entry without a number isn't an issue`() {
        assertNull(RepoIssue.parse(obj("""{"title":"No number"}""")))
        assertEquals(
            issue(45, "Cart badge", "bug"),
            RepoIssue.parse(obj("""{"number":45,"title":"Cart badge","labels":["bug"]}"""))
        )
    }
}

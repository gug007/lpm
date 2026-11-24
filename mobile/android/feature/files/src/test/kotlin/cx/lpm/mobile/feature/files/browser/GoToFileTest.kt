package cx.lpm.mobile.feature.files.browser

import cx.lpm.mobile.core.model.MentionEntry
import cx.lpm.mobile.core.model.isOutsideProject
import cx.lpm.mobile.core.model.projectDir
import cx.lpm.mobile.core.model.projectPath
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GoToFileTest {
    private fun file(path: String, changed: Boolean = false) =
        MentionEntry(path, dir = false, changed = changed)

    private val index = listOf(
        MentionEntry("src/app/checkout", dir = true, changed = true),
        file("src/app/checkout/page.tsx"),
        file("src/lib/tax.ts"),
        file("components/CheckoutButton.tsx", changed = true),
        file("components/Cart.tsx"),
        file("README.md")
    )

    @Test
    fun `names come before folder paths, changed files first, folders never`() {
        assertEquals(
            listOf("components/CheckoutButton.tsx", "src/app/checkout/page.tsx"),
            goToFileMatches(index, "checkout").map { it.path }
        )
    }

    @Test
    fun `the match ignores case and stops at the limit`() {
        assertEquals(listOf("README.md"), goToFileMatches(index, "readme").map { it.path })
        assertEquals(2, goToFileMatches(index, "s", limit = 2).size)
    }

    @Test
    fun `a rooted, home or dotted query is a path once something follows`() {
        listOf("/var/log", "~/notes.md", "./src", "../other", "/api", "~/", "../").forEach {
            assertEquals(it, typedPath(it))
        }
        assertEquals("/a b.log", typedPath("  /a b.log "))
        listOf("", "tax.ts", "src/app", "/", "./", "~", ".env", "..").forEach {
            assertNull(it, typedPath(it))
        }
    }

    @Test
    fun `a folder outside the project is an absolute path`() {
        listOf("/var/log", "/", "C:\\Users\\me", "d:/work", "\\\\srv\\share").forEach {
            assertTrue(it, isOutsideProject(it))
        }
        listOf("", "src", "src/app", ".config", "a:b", "C:").forEach {
            assertFalse(it, isOutsideProject(it))
        }
        assertEquals("/var", projectPath("/", "var"))
        assertEquals("/var/log", projectPath("/var", "log"))
        assertEquals("src", projectPath("", "src"))
    }

    @Test
    fun `a project folder reached from outside goes by its place in the project`() {
        assertEquals("src/app", projectDir("/work/shop/src/app", "/work/shop"))
        assertEquals("/work/shop2", projectDir("/work/shop2", "/work/shop"))
        assertEquals("/work", projectDir("/work", null))
        assertEquals("src", projectDir("src", "/work/shop"))
    }

    @Test
    fun `a path splits into its name and folder`() {
        assertEquals("page.tsx", fileName("src/app/page.tsx"))
        assertEquals("src/app", folderOf("src/app/page.tsx"))
        assertEquals("", folderOf("README.md"))
        assertEquals("app", fileName("src/app"))
    }
}

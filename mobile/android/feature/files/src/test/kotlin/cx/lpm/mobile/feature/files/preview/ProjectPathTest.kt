package cx.lpm.mobile.feature.files.preview

import cx.lpm.mobile.core.model.GitFile
import cx.lpm.mobile.core.model.GitSnapshot
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ProjectPathTest {
    private val fetched = "/Users/me/dev/storefront/components/CheckoutForm.tsx"

    private fun snapshot(vararg paths: String) = GitSnapshot(
        isRepo = true,
        branch = "main",
        detached = false,
        hasUpstream = true,
        ahead = 0,
        behind = 0,
        defaultBranch = "main",
        ghCli = false,
        files = paths.map { GitFile(path = it, status = "modified", staged = false, stamp = "") },
        autoPulled = null
    )

    @Test
    fun `the project path is the Mac's, nothing outside the project`() {
        assertEquals(
            "components/CheckoutForm.tsx",
            projectPath(fetched, "components/CheckoutForm.tsx")
        )
        assertNull(projectPath("/opt/homebrew/lib/node_modules/x/README.md", ""))
        assertNull(projectPath("README.md", ""))
    }

    @Test
    fun `from a Mac that doesn't say, only a relative tap is the project's`() {
        assertEquals("components/Form.tsx", projectPath("./components/Form.tsx", null))
        assertEquals("lib/a.ts", projectPath("lib/a.ts", null))
        assertNull(projectPath(fetched, null))
        assertNull(projectPath("~/dev/storefront/components/CheckoutForm.tsx", null))
        assertNull(projectPath("../storefront-wt/app/page.tsx", null))
        assertNull(projectPath("..", null))
        assertNull(projectPath("", null))
    }

    @Test
    fun `git lists a changed file by exactly its project path`() {
        val changes = snapshot("app/page.tsx", "components/CheckoutForm.tsx")
        assertEquals("app/page.tsx", changedPath("app/page.tsx", changes))
        assertNull(changedPath("page.tsx", changes))
        assertNull(changedPath("lib/payments.ts", changes))
        assertNull(changedPath(null, changes))
        assertNull(changedPath("app/page.tsx", null))
    }

    @Test
    fun `a path's folder reads as NSString's`() {
        assertEquals("components", parentPath("components/CheckoutForm.tsx"))
        assertEquals("a/b", parentPath("a/b/c.ts"))
        assertEquals("", parentPath("README.md"))
        assertEquals("/", parentPath("/README.md"))
        assertEquals("a", parentPath("a/b/"))
        assertEquals("/", parentPath("/"))
        assertEquals("", parentPath(""))
    }
}

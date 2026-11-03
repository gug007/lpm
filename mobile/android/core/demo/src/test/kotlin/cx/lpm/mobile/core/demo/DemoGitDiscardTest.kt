package cx.lpm.mobile.core.demo

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DemoGitDiscardTest {
    @Test
    fun aDiscardKeepsACopyThatUndoPutsBackOnce() = runTest {
        val demo = DemoHarness(this)
        val before = demo.changedPaths("storefront")

        val discard = demo.exchange(0.4, "gitDiscardAll", "project" to "storefront")
            .single("gitDiscardAll")
        assertEquals(true, discard["ok"])
        assertEquals("discard-1", discard.string("undo"))
        assertEquals(emptyList<String>(), demo.changedPaths("storefront"))

        assertEquals(true, demo.restore("storefront", "discard-1")["ok"])
        assertEquals(before, demo.changedPaths("storefront"))
        assertEquals(
            "That discard is no longer kept.",
            demo.restore("storefront", "discard-1").string("error")
        )
    }

    @Test
    fun nothingToDiscardKeepsNoCopy() = runTest {
        val demo = DemoHarness(this)
        val discard = demo.exchange(0.4, "gitDiscardAll", "project" to "blog")
            .single("gitDiscardAll")

        assertEquals(true, discard["ok"])
        assertFalse("undo" in discard)
        assertEquals("Not a git repository.", demo.restore("nope", "discard-1").string("error"))
    }

    @Test
    fun aCopyWhoseFilesChangedAgainStaysKept() = runTest {
        val demo = DemoHarness(this)
        demo.exchange(0.4, "gitDiscardAll", "project" to "storefront")
        val repo = demo.server.world.git.getValue("storefront")
        repo.files = listOf(DemoWorld.GitFile(path = "README.md", status = "modified", stamp = "x"))

        assertEquals(
            "Nothing was restored: some of its files exist again.",
            demo.restore("storefront", "discard-1").string("error")
        )
        assertEquals(listOf("README.md"), demo.changedPaths("storefront"))

        repo.files = emptyList()
        assertEquals(true, demo.restore("storefront", "discard-1")["ok"])
        assertEquals(4, demo.changedPaths("storefront").size)
    }

    private fun DemoHarness.changedPaths(project: String): List<String?> =
        exchange(0.3, "git", "project" to project).single("git").dictList("files")
            .map { it.string("path") }

    private fun DemoHarness.restore(project: String, id: String): Dict =
        exchange(0.4, "gitRestoreDiscarded", "project" to project, "id" to id)
            .single("gitRestoreDiscarded")
}

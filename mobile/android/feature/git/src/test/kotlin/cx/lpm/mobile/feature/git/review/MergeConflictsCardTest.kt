package cx.lpm.mobile.feature.git.review

import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.GitConflictFile
import cx.lpm.mobile.core.model.GitConflictOp
import cx.lpm.mobile.core.model.GitConflictSide
import cx.lpm.mobile.core.model.GitMergeState
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class MergeConflictsCardTest {
    @get:Rule
    val compose = createComposeRule()

    private val events = mutableListOf<Any>()
    private val open = GitConflictFile("src/a.ts", conflicts = 2, firstLine = 9, resolved = false)
    private val clean = GitConflictFile("b.ts", conflicts = 0, firstLine = 0, resolved = false)
    private val done = GitConflictFile("c.ts", conflicts = 0, firstLine = 0, resolved = true)

    private fun merge(vararg files: GitConflictFile, merging: Boolean = true) =
        GitMergeState(merging, if (merging) "feat" else "", files.toList(), null)

    private fun show(row: ReviewRow.MergeConflicts) = compose.setContent {
        LpmTheme {
            MergeConflictsCard(
                row,
                ReviewActions(
                    runConflictOp = { events += it },
                    abortMerge = { events += "abort" },
                    openConflict = { events += "open ${it.path}:${it.firstLine}" }
                )
            )
        }
    }

    @Test
    fun `each file says how it stands and opens at its first conflict`() {
        val sides = mapOf("c.ts" to GitConflictSide.Ours)
        show(ReviewRow.MergeConflicts(merge(open, clean, done), "main", sides = sides))
        compose.onNodeWithText("Merging feat into main").assertExists()
        compose.onNodeWithText("1 of 3 files resolved").assertExists()
        compose.onNodeWithContentDescription("b.ts, no markers left").assertExists()
        compose.onNodeWithContentDescription("c.ts, resolved · used ours").assertExists()
        compose.onNodeWithContentDescription("src/a.ts, 2 conflicts").performClick()
        assertEquals(listOf<Any>("open src/a.ts:9"), events)
    }

    @Test
    fun `a file's menu takes a side, and marks one edited by hand`() {
        show(ReviewRow.MergeConflicts(merge(open, clean), "main"))
        compose.onNodeWithContentDescription("Actions for a.ts").performClick()
        compose.onNodeWithText("Mark resolved").assertDoesNotExist()
        compose.onNodeWithText("Use theirs").performClick()
        compose.onNodeWithContentDescription("Actions for b.ts").performClick()
        compose.onNodeWithText("Mark resolved").performClick()
        assertEquals(
            listOf<Any>(
                GitConflictOp.Take("src/a.ts", GitConflictSide.Theirs),
                GitConflictOp.MarkResolved("b.ts")
            ),
            events
        )
    }

    @Test
    fun `the merge is continued once every file is resolved`() {
        show(ReviewRow.MergeConflicts(merge(done), "main"))
        compose.onNodeWithText("Resolve 0 with AI").assertDoesNotExist()
        compose.onNodeWithText("Continue merge").assertIsEnabled().performClick()
        assertEquals(listOf<Any>(GitConflictOp.Commit("feat")), events)
    }

    @Test
    fun `aborting asks first`() {
        show(ReviewRow.MergeConflicts(merge(open), "main"))
        compose.onNodeWithText("Continue merge").assertIsNotEnabled()
        compose.onNodeWithText("Abort merge").performClick()
        assertEquals(emptyList<Any>(), events)
        compose.onNodeWithText("Abort Merge").performClick()
        assertEquals(listOf<Any>("abort"), events)
    }

    @Test
    fun `while AI works its line shows, and everything but Stop waits`() {
        show(ReviewRow.MergeConflicts(merge(open), "main", resolving = "Reading a.ts"))
        compose.onNodeWithText("Reading a.ts").assertExists()
        compose.onNodeWithText("Resolving…").assertIsNotEnabled()
        compose.onNodeWithText("Abort merge").assertIsNotEnabled()
        compose.onNodeWithText("Stop").performClick()
        assertEquals(listOf<Any>(GitConflictOp.Stop), events)
    }

    @Test
    fun `conflicts outside a merge have nothing to continue or abort`() {
        show(ReviewRow.MergeConflicts(merge(open, merging = false), "main"))
        compose.onNodeWithText("Merge conflicts").assertExists()
        compose.onNodeWithText("Resolve 1 with AI").assertExists()
        compose.onNodeWithText("Abort merge").assertDoesNotExist()
        compose.onNodeWithText("Continue merge").assertDoesNotExist()
    }
}

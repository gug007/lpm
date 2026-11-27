package cx.lpm.mobile.feature.git.review

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Text
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onLast
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.CommitHookFailure
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class CommitHookSectionTest {
    @get:Rule
    val compose = createComposeRule()

    private val events = mutableListOf<String>()

    private val output = (1..10).joinToString("\n") { "step $it" } + "\nsrc/a.ts:3:1 error x"

    private fun show(failure: CommitHookFailure, busy: Boolean = false) = compose.setContent {
        LpmTheme {
            Column {
                CommitHookSection(
                    failure,
                    busy = busy,
                    actions = CommitHookActions(
                        retry = { events += "retry" },
                        skipHooks = { events += "skip" },
                        dismiss = { events += "dismiss" }
                    )
                ) { Text("Fix with Claude") }
            }
        }
    }

    @Test
    fun thePanelSaysWhichHookStoppedItAndWhatItFound() {
        show(CommitHookFailure("pre-commit", "eslint · 1 error", output, emptyList()))
        compose.onNodeWithText("The pre-commit hook stopped this commit").assertExists()
        compose.onNodeWithText("eslint · 1 error").assertExists()
        compose.onNodeWithText("src/a.ts:3:1 error x").assertExists()
        compose.onNodeWithText("Fix with Claude").assertExists()
        compose.onNodeWithText("Try Again").performClick()
        compose.onNodeWithContentDescription("Back to the commit").performClick()
        assertEquals(listOf("retry", "dismiss"), events)
    }

    @Test
    fun showAllUnfoldsTheWholeOutput() {
        show(CommitHookFailure("pre-commit", null, output, emptyList()))
        compose.onNodeWithText("Show All 11 Lines").performClick()
        compose.onNodeWithText(output).assertExists()
        compose.onNodeWithText("Show Less").performClick()
        compose.onNodeWithText("src/a.ts:3:1 error x").assertExists()
    }

    @Test
    fun aFormatterHooksFilesGoInWithTheRetry() {
        show(CommitHookFailure("pre-commit", null, "x", listOf("b.ts")))
        compose.onNodeWithText("It rewrote b.ts and left the change out of the commit.")
            .assertExists()
        compose.onNodeWithText("Add the File It Changed and Commit").assertExists()
        compose.onAllNodesWithText("Show All", substring = true).assertCountEquals(0)
    }

    @Test
    fun severalChangedFilesAreCounted() {
        show(CommitHookFailure("pre-commit", null, "x", listOf("b.ts", "c.ts")))
        compose.onNodeWithText("It rewrote 2 files and left the changes out of the commit.")
            .assertExists()
        compose.onNodeWithText("Add the 2 Files It Changed and Commit").assertExists()
    }

    @Test
    fun commitWithoutHooksAsksFirst() {
        show(CommitHookFailure("commit-msg", null, "x", emptyList()))
        compose.onNodeWithText("Commit Without Hooks").performClick()
        compose.onNodeWithText("Commit without hooks?").assertExists()
        compose.onNodeWithText(
            "Commits with --no-verify: the commit-msg hook and the others don't run."
        ).assertExists()
        assertEquals(emptyList<String>(), events)
        compose.onAllNodesWithText("Commit Without Hooks").onLast().performClick()
        assertEquals(listOf("skip"), events)
    }

    @Test
    fun nothingRunsWhileACommitIs() {
        show(CommitHookFailure("pre-commit", null, "x", emptyList()), busy = true)
        compose.onNodeWithText("Try Again").assertIsNotEnabled()
        compose.onNodeWithText("Commit Without Hooks").assertIsNotEnabled()
    }
}

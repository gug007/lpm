package cx.lpm.mobile.feature.git.review

import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasStateDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isPopup
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import cx.lpm.mobile.core.data.git.GitNotice
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.GitDiffResult
import cx.lpm.mobile.core.model.GitFile
import cx.lpm.mobile.feature.git.diff.ParsedDiff
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class GitReviewScreenTest {
    @get:Rule
    val compose = createComposeRule()

    private val events = mutableListOf<String>()

    private val app = GitFile("src/app.ts", "modified", staged = false, stamp = "1")
    private val logo = GitFile("assets/logo.png", "added", staged = false, stamp = "1")
    private val diff = "@@ -1,2 +1,2 @@\n-const a = 1\n+const a = 2\n keep()\n"
    private val parsed = ParsedDiff.parse(diff, "ts")

    private fun show(state: GitReviewUiState) = compose.setContent {
        LpmTheme {
            GitReviewScreen(
                state = state,
                refreshing = false,
                actions = ReviewActions(
                    back = { events += "back" },
                    retry = { events += "retry" },
                    retryDiff = { events += "retry $it" },
                    toggleSelected = { events += "select $it" },
                    toggleCollapsed = { events += "collapse $it" },
                    toggleViewed = { events += "viewed $it" },
                    toggleWrap = { events += "wrap" },
                    ask = { events += "ask $it" },
                    openCommit = { events += "open commit" },
                    createPullRequest = { events += "pr" },
                    undoDiscard = { events += "undo $it" },
                    discardFile = { events += "discard $it" }
                )
            )
        }
    }

    private fun showSheet(state: GitReviewUiState) = compose.setContent {
        LpmTheme {
            GitCommitSheet(
                state = state,
                actions = CommitActions(
                    setMessage = { events += "message $it" },
                    generateMessage = { events += "generate" },
                    toggleSelected = { events += "select $it" },
                    selectAll = { events += "all $it" },
                    commit = { events += "commit" },
                    commitAndPush = { events += "commit and push" }
                ),
                onDismiss = { events += "dismiss" }
            )
        }
    }

    private val review = listOf(
        ReviewFile(app, null, null, parsed, true, false, false, false),
        ReviewFile(logo, null, "too big", null, false, true, false, false)
    )

    private fun loaded(message: String = "", canCommit: Boolean = false) = GitReviewUiState(
        project = "storefront",
        overlay = null,
        ghCli = true,
        rows = reviewRows(review, ghCli = true),
        commitFiles = listOf(CommitFile(app, true, 1, 1), CommitFile(logo, false, null, null)),
        added = 1,
        removed = 1,
        message = message,
        selectedCount = 1,
        canCommit = canCommit
    )

    @Test
    fun theBarCountsChangesAndJumpsToFiles() {
        show(loaded())
        compose.onNodeWithText("Changes").assertExists()
        // In the title, and on the file's bar.
        compose.onAllNodesWithText("+1", substring = true).assertCountEquals(2)
        compose.onAllNodesWithText("−1", substring = true).assertCountEquals(2)
        compose.onNodeWithText("2 files changed").assertExists()
        compose.onNodeWithText("1 of 2 viewed").assertExists()
        compose.onNodeWithContentDescription("Jump to file").performClick()
        val menu = hasAnyAncestor(isPopup())
        compose.onNode(hasText("app.ts") and menu).assertExists()
        compose.onNode(hasText("assets") and menu).assertExists()
        compose.onNode(hasText("logo.png") and menu).performClick()
        compose.onNodeWithContentDescription("Back").performClick()
        assertEquals(listOf("back"), events)
    }

    @Test
    fun aDiscardsNoticeOffersUndo() {
        show(loaded().copy(notice = GitNotice("Discarded all changes", undo = "discard-1")))
        compose.onNodeWithText("Discarded all changes").assertExists()
        compose.onNode(hasText("Undo") and hasClickAction()).performClick()
        assertEquals(listOf("undo discard-1"), events)
    }

    @Test
    fun otherNoticesHaveNoUndo() {
        show(loaded().copy(notice = GitNotice("Pushed")))
        compose.onNodeWithText("Pushed").assertExists()
        compose.onNodeWithText("Undo").assertDoesNotExist()
    }

    @Test
    fun eachFileBarCollapsesMarksViewedAndOffersItsMenu() {
        show(loaded())
        compose.onNode(hasContentDescription("src/app.ts") and hasClickAction())
            .assert(hasStateDescription("Expanded"))
        compose.onNodeWithContentDescription("Modified").assertExists()
        compose.onNodeWithText("Excluded").assertExists()
        val viewed = compose.onAllNodesWithContentDescription("Viewed")
        viewed[0].assertIsOff()
        viewed[1].assertIsOn()
        viewed[1].assert(hasStateDescription("On"))
        viewed[0].performClick()
        compose.onNode(hasContentDescription("src/app.ts") and hasClickAction()).performClick()
        compose.onNode(hasContentDescription("src/app.ts") and hasClickAction())
            .performTouchInput { longClick() }
        compose.onNodeWithText("Ask agent…").performClick()
        compose.waitForIdle()
        assertEquals(listOf("viewed src/app.ts", "collapse src/app.ts", "ask src/app.ts"), events)
    }

    private fun withDiff(wrap: Boolean): GitReviewUiState {
        val result = GitDiffResult(diff, binary = false, truncated = false)
        val files = listOf(ReviewFile(app, result, null, parsed, true, false, false, false))
        return loaded().copy(rows = reviewRows(files, ghCli = false), wrap = wrap)
    }

    @Test
    fun wrapIsOnUntilAnyFileBarTurnsItOff() {
        show(loaded())
        val wrap = compose.onAllNodesWithContentDescription("Wrap")
        wrap.assertCountEquals(2)
        wrap[0].assertIsOn()
        wrap[0].assert(hasStateDescription("On"))
        wrap[1].performClick()
        assertEquals(listOf("wrap"), events)
    }

    @Test
    fun wrappedCodeIsALineByLineList() {
        show(withDiff(wrap = true))
        compose.onNodeWithText("const a = 1").assertExists()
        compose.onNodeWithText("const a = 2").assertExists()
        compose.onNodeWithText("keep()").assertExists()
    }

    @Test
    fun unwrappedCodeScrollsAsOneBlock() {
        show(withDiff(wrap = false))
        compose.onNodeWithContentDescription("Wrap")
            .assertIsOff()
            .assert(hasStateDescription("Off"))
        compose.onNodeWithText("const a = 2").assertDoesNotExist()
        compose.onNodeWithText("+const a = 2", substring = true).assertExists()
    }

    @Test
    fun aFileLeftOutOfTheCommitCanBeIncludedFromItsMenu() {
        show(loaded())
        compose.onAllNodesWithContentDescription("More").assertCountEquals(2)
        compose.onNode(hasContentDescription("assets/logo.png") and hasClickAction())
            .performTouchInput { longClick() }
        compose.onNodeWithText("Copy Path").assertExists()
        compose.onNodeWithText("Include in Commit").performClick()
        compose.waitForIdle()
        assertEquals(listOf("select assets/logo.png"), events)
    }

    @Test
    fun aFilesChangesAreDiscardedOnceConfirmed() {
        show(loaded().copy(canDiscardFiles = true))
        compose.onAllNodesWithContentDescription("More")[1].performClick()
        compose.onNodeWithText("Discard Changes…").performClick()
        compose.onNodeWithText("Discard changes to logo.png?").assertExists()
        compose.onNodeWithText(
            "assets/logo.png goes back to how it was at the last commit. lpm keeps a copy on " +
                "the Mac for 7 days, so you can undo it."
        ).assertExists()
        compose.onNodeWithText("Discard Changes").performClick()
        compose.waitForIdle()
        assertEquals(listOf("discard assets/logo.png"), events)
        compose.onNodeWithText("Discard changes to logo.png?").assertDoesNotExist()
    }

    @Test
    fun anOlderMacOffersNoDiscardOfOneFile() {
        show(loaded())
        compose.onAllNodesWithContentDescription("More")[0].performClick()
        compose.onNodeWithText("Copy Path").assertExists()
        compose.onNodeWithText("Discard Changes…").assertDoesNotExist()
    }

    @Test
    fun aRunningDiscardDimsTheItem() {
        show(loaded().copy(canDiscardFiles = true, discarding = true))
        compose.onAllNodesWithContentDescription("More")[0].performClick()
        compose.onNode(hasText("Discard Changes…") and hasClickAction()).assertIsNotEnabled()
    }

    @Test
    fun theCommitBarOpensTheSheet() {
        show(loaded())
        compose.onNodeWithText("Commit 1 file").performClick()
        assertEquals(listOf("open commit"), events)
    }

    @Test
    fun aFailedDiffOffersRetry() {
        show(loaded())
        compose.onNodeWithText("too big").assertExists()
        compose.onNodeWithText("Retry").performClick()
        assertEquals(listOf("retry assets/logo.png"), events)
    }

    @Test
    fun theSheetNeedsAMessageAndPicksFilesOnItsOwnPage() {
        showSheet(loaded())
        compose.onNodeWithText("Commit message").assertExists()
        compose.onNode(hasText("Commit and Push") and hasClickAction()).assertIsNotEnabled()
        compose.onNode(hasText("Commit only") and hasClickAction()).assertIsNotEnabled()
        compose.onNodeWithText("Only the selected files are committed.").assertDoesNotExist()
        compose.onNodeWithText("Generate message").performClick()
        compose.onNodeWithText("1 of 2").assertExists()
        compose.onNodeWithText("Files").performClick()
        compose.onNodeWithText("Only the selected files are committed.").assertExists()
        compose.onNodeWithContentDescription("src/app.ts").assert(hasStateDescription("Included"))
        compose.onNodeWithContentDescription("assets/logo.png")
            .assert(hasStateDescription("Excluded"))
            .performClick()
        compose.onNodeWithText("Select All").performClick()
        compose.onNodeWithContentDescription("Back").performClick()
        compose.onNodeWithText("Commit message").assertExists()
        assertEquals(listOf("generate", "select assets/logo.png", "all true"), events)
    }

    @Test
    fun aMessageEnablesBothCommits() {
        showSheet(loaded(message = "fix: x", canCommit = true))
        compose.onNodeWithText("fix: x").assertExists()
        compose.onNode(hasText("Commit and Push") and hasClickAction()).performClick()
        compose.onNode(hasText("Commit only") and hasClickAction()).performClick()
        assertEquals(listOf("commit and push", "commit"), events)
    }

    @Test
    fun aDraftedMessageOffersRegenerateAndShowsWhereItPushes() {
        showSheet(
            loaded(message = "feat: x", canCommit = true).copy(drafted = true, branch = "main")
        )
        compose.onNodeWithText("Drafted from the diff").assertExists()
        compose.onNodeWithText("Generate message").assertDoesNotExist()
        compose.onNodeWithText("Branch").assertExists()
        compose.onNodeWithText("main → origin").assertExists()
        compose.onNodeWithText("Regenerate").performClick()
        assertEquals(listOf("generate"), events)
    }

    @Test
    fun theButtonTappedShowsItsProgress() {
        showSheet(loaded(message = "feat: x").copy(busy = CommitBusy.Pushing))
        compose.onNode(hasText("Pushing…") and hasClickAction()).assertIsNotEnabled()
        compose.onNode(hasText("Commit only") and hasClickAction()).assertIsNotEnabled()
        compose.onNodeWithText("Branch").assertDoesNotExist()
    }

    private val conflicted = GitFile("src/merge.ts", "conflicted", staged = false, stamp = "1")

    private fun conflictedState() = loaded().copy(
        conflicted = listOf("src/merge.ts"),
        rows = reviewRows(
            listOf(ReviewFile(conflicted, null, null, null, true, false, true, false)),
            ghCli = false
        ),
        commitFiles = listOf(CommitFile(conflicted, true, null, null))
    )

    @Test
    fun aConflictedFileIsFlagged() {
        show(conflictedState())
        compose.onNodeWithContentDescription("Merge conflict").assertExists()
    }

    @Test
    fun theSheetNamesConflictedFiles() {
        showSheet(conflictedState())
        compose.onNodeWithText(
            "src/merge.ts has merge conflicts. Resolve the conflict markers " +
                "(<<<<<<< … >>>>>>>) before committing."
        ).assertExists()
    }

    @Test
    fun noChangesStillOffersAPullRequest() {
        show(GitReviewUiState(overlay = ReviewOverlay.NoChanges, ghCli = true))
        compose.onNodeWithText("No changes").assertExists()
        compose.onNodeWithText("The working tree is clean.").assertExists()
        compose.onNodeWithText("Commit", substring = true).assertDoesNotExist()
        compose.onNodeWithText("Create Pull Request").performClick()
        assertEquals(listOf("pr"), events)
    }

    @Test
    fun overlaysSayWhyThereIsNothingToReview() {
        show(
            GitReviewUiState(
                overlay = ReviewOverlay.Unreachable,
                loadError = "Couldn't reach your Mac. Pull to refresh."
            )
        )
        compose.onNodeWithText("Can't reach your Mac").assertExists()
        compose.onNodeWithText("Couldn't reach your Mac. Pull to refresh.").assertExists()
        compose.onNodeWithText("Retry").performClick()
        compose.onNodeWithContentDescription("Jump to file").assertDoesNotExist()
        assertEquals(listOf("retry"), events)
    }

    @Test
    fun aProjectThatIsNotARepo() {
        show(GitReviewUiState(overlay = ReviewOverlay.NotRepo))
        compose.onNodeWithText("Not a git repository").assertExists()
        compose.onNodeWithText(
            "This project isn't tracked by git, so there's nothing to review."
        ).assertExists()
    }
}

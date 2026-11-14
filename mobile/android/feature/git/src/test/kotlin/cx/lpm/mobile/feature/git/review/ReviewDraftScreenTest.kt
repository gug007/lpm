package cx.lpm.mobile.feature.git.review

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.GitFile
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** The kept draft over Commit, and a viewed file whose diff changed since. */
@RunWith(RobolectricTestRunner::class)
class ReviewDraftScreenTest {
    @get:Rule
    val compose = createComposeRule()

    private val events = mutableListOf<String>()

    private val app = GitFile("src/app.ts", "modified", staged = false, stamp = "1")

    private fun show(state: GitReviewUiState) = compose.setContent {
        LpmTheme {
            GitReviewScreen(
                state = state,
                refreshing = false,
                actions = ReviewActions(
                    clearDraft = { events += "clear draft" },
                    focusShown = { events += "focus shown" }
                )
            )
        }
    }

    private fun loaded(changedSince: Instant? = null) = GitReviewUiState(
        project = "storefront",
        overlay = null,
        rows = reviewRows(
            listOf(ReviewFile(app, null, null, null, true, false, false, false, changedSince)),
            ghCli = false
        ),
        selectedCount = 1
    )

    @Test
    fun theDraftSitsOverCommitWithAClearButton() {
        show(loaded().copy(draft = DraftChip("fix: checkout", listOf("logo.png"))))
        compose.onNodeWithText("Draft: “fix: checkout” · logo.png left out").assertExists()
        compose.onNodeWithText("Commit 1 file").assertExists()
        compose.onNodeWithContentDescription("Clear draft").performClick()
        assertEquals(listOf("clear draft"), events)
    }

    @Test
    fun severalFilesLeftOutAreCounted() {
        show(loaded().copy(draft = DraftChip(null, listOf("a.ts", "b.ts"))))
        compose.onNodeWithText("Draft: 2 files left out").assertExists()
    }

    @Test
    fun noDraftNoChip() {
        show(loaded())
        compose.onNodeWithContentDescription("Clear draft").assertDoesNotExist()
    }

    @Test
    fun aFileChangedSinceViewedSaysSoInsteadOfItsFolder() {
        show(loaded(changedSince = Instant.now()))
        compose.onNodeWithText("Changed since viewed · ", substring = true).assertExists()
        compose.onNodeWithText("src").assertDoesNotExist()
    }

    @Test
    fun openedOnAFileItScrollsThereOnce() {
        show(loaded().copy(focus = "src/app.ts"))
        compose.mainClock.advanceTimeBy(1_000)
        compose.waitForIdle()
        assertEquals(listOf("focus shown"), events)
    }
}

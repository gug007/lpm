package cx.lpm.mobile.feature.git.history

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.CommitFile
import cx.lpm.mobile.core.model.HistoryCommit
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class CommitHistoryScreenTest {
    @get:Rule
    val compose = createComposeRule()

    private val events = mutableListOf<String>()
    private val now = 1_760_000_000L

    private val claude = "Claude Opus 5.5 <noreply@anthropic.com>"
    private val ahead = HistoryCommit(
        "a1f3c9e5b2", "a1f3c9e", "Two-step checkout flow",
        "Split the form into address and payment steps.\n\nCo-authored-by: $claude",
        "Alex Kim", "alex@example.com", now - 12 * 60, 1, listOf(claude), unpushed = true
    )
    private val pushed = HistoryCommit(
        "3e91a07f2b", "3e91a07", "Merge pull request #408", "", "Sam Lee", "",
        now - 3 * 3_600, 2, emptyList(), unpushed = false
    )

    private fun showHistory(state: CommitHistoryUiState) = compose.setContent {
        LpmTheme {
            CommitHistoryScreen(
                state = state,
                refreshing = false,
                actions = HistoryActions(
                    retry = { events += "retry" },
                    loadMore = { events += "more" },
                    open = { events += "open ${it.short}" }
                )
            )
        }
    }

    @Test
    fun `commits read newest first with the pushed line, and open on a tap`() {
        showHistory(
            CommitHistoryUiState(
                commits = listOf(ahead, pushed),
                boundary = 1,
                hasMore = true,
                loaded = true,
                branch = "feat/checkout",
                unpushed = 1,
                now = now
            )
        )
        compose.onNodeWithText("History").assertIsDisplayed()
        compose.onNodeWithText("1 not pushed", substring = true).assertIsDisplayed()
        compose.onNodeWithText("12m ago").assertIsDisplayed()
        compose.onNodeWithText("3h ago").assertIsDisplayed()
        compose.onNodeWithContentDescription("Not pushed yet").assertIsDisplayed()
        compose.onNodeWithContentDescription("With Claude Opus 5.5").assertExists()
        compose.onNodeWithContentDescription("Pushed").assertIsDisplayed()
        compose.onNodeWithText("Two-step checkout flow").performClick()
        compose.onNodeWithText("Load older commits").performClick()
        assertEquals(listOf("open a1f3c9e", "more"), events)
    }

    @Test
    fun `an empty branch says so`() {
        showHistory(CommitHistoryUiState(loaded = true))
        compose.onNodeWithText("No commits on this branch yet.").assertIsDisplayed()
    }

    @Test
    fun `a failure offers Retry`() {
        showHistory(CommitHistoryUiState(error = "Not a git repository.", loaded = true))
        compose.onNodeWithText("Not a git repository.").assertIsDisplayed()
        compose.onNodeWithText("Retry").performClick()
        assertEquals(listOf("retry"), events)
    }

    @Test
    fun `a commit shows who wrote it with whom, copies its hash and lists its files`() {
        val files = listOf(
            CommitFile("app/cart/page.tsx", "app/cart.tsx", "renamed", 3, 1),
            CommitFile("public/cart-icon.png", null, "added", null, null)
        )
        compose.setContent {
            LpmTheme {
                CommitDetailScreen(
                    state = CommitDetailUiState(ahead, files),
                    actions = CommitDetailActions(
                        copyHash = { events += "hash" },
                        open = { events += "file ${it.path}" }
                    )
                )
            }
        }
        compose.onNodeWithText("a1f3c9e").assertIsDisplayed()
        compose.onNodeWithText("with Claude Opus 5.5").assertIsDisplayed()
        compose.onNodeWithText("Split the form into address and payment steps.").assertIsDisplayed()
        compose.onNodeWithText("2 files").assertIsDisplayed()
        compose.onNodeWithText("from app/cart.tsx").assertIsDisplayed()
        compose.onNodeWithText("binary").assertIsDisplayed()
        compose.onNodeWithContentDescription("Copy the full hash").performClick()
        compose.onNodeWithText("page.tsx").performClick()
        assertEquals(listOf("hash", "file app/cart/page.tsx"), events)
    }
}

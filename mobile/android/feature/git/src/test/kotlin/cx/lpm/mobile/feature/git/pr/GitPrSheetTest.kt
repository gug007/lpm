package cx.lpm.mobile.feature.git.pr

import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class GitPrSheetTest {
    @get:Rule
    val compose = createComposeRule()

    private val events = mutableListOf<String>()

    private fun show(state: GitPrUiState) = compose.setContent {
        LpmTheme {
            GitPrSheet(
                state = state,
                onDismiss = { events += "dismiss" },
                onTitle = { events += "title $it" },
                onBody = { events += "body $it" },
                onCloseIssue = { events += "close $it" },
                onGenerate = { events += "generate" },
                onCreate = { events += "create" }
            )
        }
    }

    @Test
    fun createNeedsATitle() {
        show(GitPrUiState())
        compose.onNodeWithText("Pull Request").assertExists()
        compose.onNodeWithText("Create").assertIsNotEnabled()
        compose.onNodeWithText(
            "Creating a pull request pushes your branch first, so it can take a moment."
        )
            .assertExists()
        compose.onNodeWithText("Generate with AI").performClick()
        compose.onNodeWithText("Cancel").performClick()
        assertEquals(listOf("generate", "dismiss"), events)
    }

    @Test
    fun aDraftCanBeCreated() {
        show(GitPrUiState(title = "Redesign the checkout flow", body = "## Summary"))
        compose.onNodeWithText("Redesign the checkout flow").assertExists()
        compose.onNodeWithText("Create").assertIsEnabled().performClick()
        assertEquals(listOf("create"), events)
    }

    @Test
    fun aBranchStartedFromAnIssueOffersToCloseIt() {
        show(GitPrUiState(title = "T", issue = 38))
        compose.onNodeWithText("Adds “Closes #38” to the description.").assertExists()
        compose.onNodeWithText("Close #38 on merge").assertExists()
        compose.onNodeWithContentDescription("Close #38 on merge").performClick()
        assertEquals(listOf("close false"), events)
    }

    @Test
    fun anyOtherBranchHasNothingToClose() {
        show(GitPrUiState(title = "T"))
        compose.onNodeWithText("on merge", substring = true).assertDoesNotExist()
    }

    @Test
    fun generatingHoldsCreate() {
        show(GitPrUiState(title = "T", generating = true))
        compose.onNodeWithText("Generating…").assertExists()
        compose.onNodeWithText("Create").assertIsNotEnabled()
    }

    @Test
    fun theCreatedPullRequestLinksOut() {
        show(GitPrUiState(createdUrl = "https://github.com/demo/storefront/pull/42"))
        compose.onNodeWithText("Pull request created").assertExists()
        compose.onNodeWithText("https://github.com/demo/storefront/pull/42").assertExists()
        compose.onNodeWithText("Open in Browser").assertExists()
        compose.onNodeWithText("Create").assertDoesNotExist()
        compose.onNodeWithText("Done").performClick()
        assertEquals(listOf("dismiss"), events)
    }
}

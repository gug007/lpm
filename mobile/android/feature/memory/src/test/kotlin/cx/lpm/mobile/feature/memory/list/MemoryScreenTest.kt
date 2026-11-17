package cx.lpm.mobile.feature.memory.list

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
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
class MemoryScreenTest {
    @get:Rule
    val compose = createComposeRule()

    private val events = mutableListOf<String>()

    private val checkout = MemoryRowUi(
        name = "checkout-redesign",
        title = "Checkout redesign",
        subtitle = "Rebuild checkout as a two-column flow.",
        stamp = "claude · 2 hours ago"
    )

    private fun show(state: MemoryUiState) = compose.setContent {
        LpmTheme {
            MemoryScreen(
                state = state,
                refreshing = false,
                onRefresh = {},
                actions = MemoryActions(
                    back = { events += "back" },
                    create = { events += "create" },
                    open = { events += "open ${it.name}" },
                    delete = { events += "delete ${it.name}" },
                    retry = { events += "retry" }
                )
            )
        }
    }

    @Test
    fun rowsOpenAndSwipeToDelete() {
        show(
            MemoryUiState(
                project = "storefront",
                ownerLabel = "storefront",
                loading = false,
                rows = listOf(checkout)
            )
        )
        compose.onNodeWithText("Memory").assertExists()
        compose.onNodeWithText("claude · 2 hours ago").assertExists()
        compose.onNodeWithText("Rebuild checkout as a two-column flow.").assertExists()
        compose.onNodeWithText("Shared with storefront").assertDoesNotExist()
        compose.onNode(hasText("Checkout redesign") and hasClickAction()).performClick()
        compose.onNodeWithContentDescription("New session").performClick()
        val swipe = compose.onNode(hasCustomAction("Delete")).fetchSemanticsNode()
        compose.runOnIdle {
            swipe.config[SemanticsActions.CustomActions].first { it.label == "Delete" }.action()
        }
        assertEquals(listOf("open checkout-redesign", "create", "delete checkout-redesign"), events)
    }

    @Test
    fun aCopySaysWhoseSessionsTheseAre() {
        show(
            MemoryUiState(
                ownerLabel = "storefront",
                shared = true,
                loading = false,
                rows = listOf(checkout)
            )
        )
        compose.onNodeWithText("Shared with storefront").assertExists()
    }

    @Test
    fun nothingYetOffersANewSession() {
        show(MemoryUiState(loading = false))
        compose.onNodeWithText("No memory yet").assertExists()
        compose.onNodeWithText(
            "A memory session is a shared log of the work, so any agent can pick it up later and continue where the last one stopped."
        ).assertExists()
        compose.onNodeWithText("or ask an agent to run").assertExists()
        compose.onNodeWithText("/lpm-memory <name>").assertExists()
        compose.onNodeWithText("New Memory Session").performClick()
        assertEquals(listOf("create"), events)
    }

    @Test
    fun aFailureOffersToTryAgain() {
        show(MemoryUiState(loading = false, error = "Couldn't reach your Mac. Pull to refresh."))
        compose.onNodeWithText("Couldn't load memory").assertExists()
        compose.onNodeWithText("Couldn't reach your Mac. Pull to refresh.").assertExists()
        compose.onNodeWithText("Try Again").performClick()
        compose.onNodeWithContentDescription("Back").performClick()
        assertEquals(listOf("retry", "back"), events)
    }

    @Test
    fun loadingShowsNeitherStateNorRows() {
        show(MemoryUiState())
        compose.onNodeWithText("No memory yet").assertDoesNotExist()
        compose.onNodeWithText("Couldn't load memory").assertDoesNotExist()
    }

    private fun hasCustomAction(label: String) = SemanticsMatcher("has the $label action") { node ->
        SemanticsActions.CustomActions in node.config &&
            node.config[SemanticsActions.CustomActions].any { it.label == label }
    }
}

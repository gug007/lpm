package cx.lpm.mobile.feature.automations.list

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.automations.format.AutomationTone
import cx.lpm.mobile.feature.automations.job
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class AutomationsScreenTest {
    @get:Rule
    val compose = createComposeRule()

    private val events = mutableListOf<String>()

    private val nightly = AutomationRowUi(
        job = job(""""emoji":"🌙","unread":1"""),
        scope = "storefront",
        status = "1 new message · Every day at 03:00 · in 9 hours",
        statusTone = AutomationTone.Green
    )
    private val weekly = AutomationRowUi(
        job = job(""""id":"weekly","label":"Weekly dependency check","enabled":false"""),
        scope = "blog",
        status = "Off · Mon at 06:00",
        statusTone = AutomationTone.Secondary
    )

    private fun show(state: AutomationsUiState) = compose.setContent {
        LpmTheme {
            AutomationsScreen(
                state = state,
                refreshing = false,
                onRefresh = {},
                actions = AutomationsActions(
                    open = { events += "open ${it.id}" },
                    create = { events += "create" },
                    edit = { events += "edit ${it.id}" },
                    markAllRead = { events += "mark all" },
                    markRead = { events += "read ${it.id}" },
                    toggleEnabled = { events += "toggle ${it.id}" },
                    toggleFailedOnly = { events += "failed only" },
                    run = { events += "run ${it.id}" }
                )
            )
        }
    }

    @Test
    fun unreadRunsLeadUnderNewWithMarkAllRead() {
        show(AutomationsUiState(loaded = true, unread = listOf(nightly), read = listOf(weekly)))
        compose.onNodeWithText("New").assertExists()
        compose.onNodeWithText("Earlier").assertExists()
        compose.onNodeWithText("storefront").assertExists()
        compose.onNodeWithText("Off · Mon at 06:00").assertExists()
        compose.onNodeWithText("Mark all read").performClick()
        compose.onNodeWithContentDescription("New automation").performClick()
        compose.onNode(hasText("Nightly tests") and hasClickAction()).performClick()
        assertEquals(listOf("mark all", "create", "open nightly"), events)
    }

    @Test
    fun nothingUnreadDropsTheHeadersAndMarkAllRead() {
        show(AutomationsUiState(loaded = true, read = listOf(weekly)))
        compose.onNodeWithText("Mark all read").assertDoesNotExist()
        compose.onNodeWithText("Earlier").assertDoesNotExist()
        compose.onNodeWithText("New").assertDoesNotExist()
    }

    @Test
    fun aLongPressOffersEditReadAndTurnOff() {
        show(AutomationsUiState(loaded = true, unread = listOf(nightly)))
        compose.onNode(hasText("Nightly tests") and hasClickAction())
            .performTouchInput { longClick() }
        compose.onNodeWithText("Mark read").performClick()
        compose.onNode(hasText("Nightly tests") and hasClickAction())
            .performTouchInput { longClick() }
        compose.onNodeWithText("Turn off").performClick()
        compose.onNode(hasText("Nightly tests") and hasClickAction())
            .performTouchInput { longClick() }
        compose.onNodeWithText("Edit").performClick()
        assertEquals(listOf("read nightly", "toggle nightly", "edit nightly"), events)
    }

    @Test
    fun anEmptyListOffersANewAutomation() {
        show(AutomationsUiState(loaded = true, project = "blog"))
        compose.onNodeWithText("No automations").assertExists()
        compose.onNodeWithText(
            "Scheduled tasks that run in this project on their own."
        ).assertExists()
        compose.onNode(hasText("New automation") and hasClickAction()).performClick()
        assertEquals(listOf("create"), events)
    }

    @Test
    fun aFailedRunOffersTheFilterAndRetry() {
        val failed = AutomationRowUi(
            job = job(""""lastResult":"error""""),
            scope = "storefront",
            status = "Problem during the run after 4m 30s · npm not found",
            statusTone = AutomationTone.Red,
            failed = true
        )
        show(AutomationsUiState(loaded = true, read = listOf(failed), failedCount = 1))
        compose.onNodeWithContentDescription("Failed, 1").assertIsNotSelected().performClick()
        val row = compose.onNode(hasCustomAction("Retry")).fetchSemanticsNode()
        compose.runOnIdle {
            row.config[SemanticsActions.CustomActions].first { it.label == "Retry" }.action()
        }
        assertEquals(listOf("failed only", "run nightly"), events)
    }

    @Test
    fun noFailedRunNoFilter() {
        show(AutomationsUiState(loaded = true, read = listOf(weekly)))
        compose.onNodeWithText("Failed").assertDoesNotExist()
    }

    @Test
    fun theFirstListIsAwaited() {
        show(AutomationsUiState())
        compose.onNodeWithText("Loading automations…").assertExists()
    }

    private fun hasCustomAction(label: String) = SemanticsMatcher("has the $label action") { node ->
        SemanticsActions.CustomActions in node.config &&
            node.config[SemanticsActions.CustomActions].any { it.label == label }
    }
}

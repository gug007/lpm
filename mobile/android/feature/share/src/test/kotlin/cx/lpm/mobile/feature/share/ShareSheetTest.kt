package cx.lpm.mobile.feature.share

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.ShareDestination
import cx.lpm.mobile.core.model.ShareDirectory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ShareSheetTest {
    @get:Rule
    val compose = createComposeRule()

    private val ready = ShareUiState(
        directory = ShareDirectory(listOf(studio, mini)),
        items = SharedItems(title = "A post").adding("https://example.com/post"),
        phase = SharePhase.Ready,
        macId = "srv-1",
        project = "storefront",
        destination = ShareDestination.Agent,
        agent = "claude"
    )

    private fun show(state: ShareUiState, actions: ShareActions = ShareActions()) {
        compose.setContent { LpmTheme { ShareSheet(state, actions) } }
    }

    @Test
    fun theSheetShowsWhatCameInTheNoteTheProjectAndWhereItGoes() {
        val picked = mutableListOf<ShareDestination>()
        var sent = 0
        show(ready, ShareActions(destination = { picked += it }, send = { sent++ }))
        compose.onNodeWithText("Send to lpm").assertExists()
        compose.onNodeWithText("Cancel").assertExists()
        compose.onNodeWithText("A post").assertExists()
        compose.onNodeWithText("https://example.com/post").assertExists()
        compose.onNodeWithText("Add a note").assertExists()
        compose.onNodeWithText("What should happen with it?").assertExists()
        compose.onNodeWithText("Computer").assertExists()
        compose.onNodeWithText("Studio Mac").assertExists()
        compose.onNodeWithText("Storefront").assertExists()
        compose.onNodeWithText("It's the tab's first prompt").assertExists()
        compose.onNodeWithText("Agent").assertExists()
        compose.onNodeWithText("Claude Code").assertExists()
        compose.onNodeWithText("Kept in the project's notes").assertExists()
        compose.onNodeWithText("New agent tab", useUnmergedTree = true).assertExists()

        compose.onNodeWithText("Notes").performScrollTo().performClick()
        assertEquals(listOf(ShareDestination.Notes), picked)
        compose.onNodeWithText("Send").assertIsEnabled().performClick()
        assertEquals(1, sent)
    }

    @Test
    fun aMacWithoutAgentsOffersOnlyNotesAndOneMacNoComputerPicker() {
        val notesOnly = ready.copy(
            directory = ShareDirectory(listOf(mini)),
            macId = "srv-2",
            project = "blog",
            destination = ShareDestination.Notes,
            agent = ""
        )
        show(notesOnly)
        compose.onNodeWithText("New agent tab").assertDoesNotExist()
        compose.onNodeWithText("Computer").assertDoesNotExist()
        compose.onNodeWithText("Blog").assertExists()
        compose.onNodeWithText("Kept in the project's notes").assertExists()
    }

    @Test
    fun withNothingToSendSendWaits() {
        show(ready.copy(items = SharedItems(), note = ""))
        compose.onNodeWithText("Send").assertIsNotEnabled()
    }

    @Test
    fun withoutAMacItAsksToConnectFirst() {
        show(ShareUiState(directory = ShareDirectory(), phase = SharePhase.Ready))
        compose.onNodeWithText("Connect lpm Link first").assertExists()
        compose.onNodeWithText("Open lpm Link and connect it to your Mac, then share again.")
            .assertExists()
        compose.onNodeWithText("Send").assertDoesNotExist()
    }

    @Test
    fun theCardSaysHowTheSendGoesAndAKeptShareClosesOnDone() {
        var state by mutableStateOf(ready.copy(phase = SharePhase.Sending))
        var done = 0
        compose.setContent { LpmTheme { ShareSheet(state, ShareActions(done = { done++ })) } }
        compose.onNodeWithText("Sending to Studio Mac…").assertExists()

        state = ready.copy(phase = SharePhase.Queued)
        compose.onNodeWithText("Saved for later").assertExists()
        compose.onNodeWithText("lpm Link sends it to Studio Mac the next time it reaches it.")
            .assertExists()
        compose.onNodeWithText("Done").performClick()
        compose.waitUntil { done == 1 }
    }

    @Test
    fun aSentShareClosesTheSheetByItself() {
        var done = 0
        show(ready.copy(phase = SharePhase.Sent), ShareActions(done = { done++ }))
        compose.onNodeWithText("Sent to Storefront").assertExists()
        compose.mainClock.advanceTimeBy(1_000)
        compose.waitUntil { done == 1 }
    }

    @Test
    fun aRefusalIsAnAlertInTheMacsWords() {
        var dismissed = 0
        show(
            ready.copy(phase = SharePhase.Failed("The lpm window is closed.")),
            ShareActions(dismissFailure = { dismissed++ })
        )
        compose.onNodeWithText("Couldn't send").assertExists()
        compose.onNodeWithText("The lpm window is closed.").assertExists()
        compose.onNodeWithText("OK").performClick()
        assertTrue(dismissed >= 1)
    }

    @Test
    fun theChosenDestinationIsMarkedSelected() {
        show(ready)
        compose.onNodeWithText("It's the tab's first prompt", useUnmergedTree = true)
            .assertExists()
        compose.onNodeWithText("New agent tab").assertIsSelected()
    }
}

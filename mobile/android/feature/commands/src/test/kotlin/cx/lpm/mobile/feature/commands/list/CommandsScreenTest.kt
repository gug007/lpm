package cx.lpm.mobile.feature.commands.list

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.CommandScope
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class CommandsScreenTest {
    @get:Rule
    val compose = createComposeRule()

    private val events = mutableListOf<String>()

    private fun show(state: CommandsUiState) = compose.setContent {
        LpmTheme {
            CommandsScreen(
                state = state,
                refreshing = false,
                onRefresh = {},
                leading = {},
                actions = CommandsActions(
                    newCommand = { events += "new" },
                    openFolder = { events += "open ${it.folder}" },
                    newFolder = { events += "new folder" },
                    renameFolder = { events += "rename $it" },
                    deleteFolder = { events += "delete $it" },
                    pickScope = { events += "pick $it" },
                    retry = { events += "retry" }
                )
            )
        }
    }

    private val loaded = CommandsUiState(
        scopes = CommandScope.entries,
        scope = CommandScope.Project,
        loaded = true,
        folders = listOf(FolderRowUi("Bugs", 1), FolderRowUi(null, 0)),
        hasList = true
    )

    @Test
    fun foldersOpenAndOfferTheirChanges() {
        show(loaded)
        compose.onNodeWithText("Commands").assertExists()
        compose.onNodeWithText("Bugs").performClick()
        compose.onNodeWithText("No folder").performClick()
        compose.onNodeWithText("Bugs").performTouchInput { longClick() }
        compose.onNodeWithText("Rename").performClick()
        compose.onNodeWithText("Bugs").performTouchInput { longClick() }
        compose.onNodeWithText("Delete folder").performClick()
        compose.onNodeWithText("New folder").performClick()
        compose.onNodeWithContentDescription("New command").performClick()
        compose.onNodeWithText("Global").performClick()
        assertEquals(
            listOf(
                "open Bugs",
                "open null",
                "rename Bugs",
                "delete Bugs",
                "new folder",
                "new",
                "pick Global"
            ),
            events
        )
    }

    @Test
    fun theProjectListThatCouldNotBeReadSaysWhy() {
        show(
            loaded.copy(
                folders = emptyList(),
                hasList = false,
                projectError = "The host didn't answer."
            )
        )
        compose.onNodeWithText("The host didn't answer.").assertExists()
        compose.onNodeWithText("New folder").assertDoesNotExist()
    }

    @Test
    fun aFailedLoadOffersTryAgain() {
        show(CommandsUiState(loadError = "Lost the connection to the Mac."))
        compose.onNodeWithText("Couldn't load commands").assertExists()
        compose.onNodeWithText("Try Again").performClick()
        assertEquals(listOf("retry"), events)
    }
}

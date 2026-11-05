package cx.lpm.mobile.feature.commands.list

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.UriHandler
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

    private val uriHandler = object : UriHandler {
        override fun openUri(uri: String) {
            events += "watch $uri"
        }
    }

    private fun show(state: CommandsUiState) = compose.setContent {
        LpmTheme {
            CompositionLocalProvider(LocalUriHandler provides uriHandler) {
                CommandsScreen(
                    state = state,
                    refreshing = false,
                    onRefresh = {},
                    leading = {},
                    actions = CommandsActions(
                        newCommand = { events += "new" },
                        openFolder = { events += "open ${it.folder}" },
                        newFolder = { events += "new folder" },
                        openOthers = { events += "others" },
                        renameFolder = { events += "rename $it" },
                        deleteFolder = { events += "delete $it" },
                        pickScope = { events += "pick $it" },
                        retry = { events += "retry" }
                    )
                )
            }
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
        compose.onNodeWithText("Skills").assertExists()
        compose.onNodeWithText("Bugs").performClick()
        compose.onNodeWithText("No folder").performClick()
        compose.onNodeWithText("Bugs").performTouchInput { longClick() }
        compose.onNodeWithText("Rename").performClick()
        compose.onNodeWithText("Bugs").performTouchInput { longClick() }
        compose.onNodeWithText("Delete folder").performClick()
        compose.onNodeWithText("New folder").performClick()
        compose.onNodeWithContentDescription("New skill").performClick()
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
    fun videoGuidesListTheLessonsAndOpenOne() {
        show(loaded)
        compose.onNodeWithContentDescription("Video guides").performClick()
        compose.onNodeWithText("Manage skills in one place").assertExists()
        compose.onNodeWithText("7:00").assertExists()
        compose.onNodeWithText("3:38").assertExists()
        compose.onNodeWithText("Organize skills in folders").performClick()
        assertEquals(listOf("watch https://www.youtube.com/watch?v=MI_GqFpr6ms"), events)
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
        compose.onNodeWithText("Couldn't load skills").assertExists()
        compose.onNodeWithText("Try Again").performClick()
        assertEquals(listOf("retry"), events)
    }

    @Test
    fun aListWithOtherSkillsOffersThem() {
        show(loaded.copy(otherSkills = 3))
        compose.onNodeWithText("3").assertExists()
        compose.onNodeWithText("Other skills").performClick()
        assertEquals(listOf("others"), events)
    }

    @Test
    fun aListWithoutOtherSkillsLeavesTheRowOut() {
        show(loaded)
        compose.onNodeWithText("Other skills").assertDoesNotExist()
    }
}

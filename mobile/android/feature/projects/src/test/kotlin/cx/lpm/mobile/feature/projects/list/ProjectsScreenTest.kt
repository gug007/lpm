package cx.lpm.mobile.feature.projects.list

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTouchInput
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.AppTip
import cx.lpm.mobile.core.model.ProjectFolder
import cx.lpm.mobile.feature.projects.project
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ProjectsScreenTest {
    @get:Rule
    val compose = createComposeRule()

    private val events = mutableListOf<String>()
    private val folder =
        ProjectFolder("g1", "Client Work", collapsed = false, members = listOf("blog"))

    private val state = ProjectsUiState(
        demoMode = true,
        rows = listOf(
            entry("storefront"),
            ProjectsListRow.FolderEntry(folder, count = 1, expanded = true),
            entry("blog", indented = true, folderId = "g1")
        ),
        listIsEmpty = false,
        loaded = true,
        folders = listOf(folder),
        automationsUnread = 2
    )

    private fun entry(name: String, indented: Boolean = false, folderId: String? = null) =
        ProjectsListRow.ProjectEntry(
            project = project(name, running = name == "storefront"),
            indented = indented,
            pending = false,
            stale = false,
            queued = emptyList(),
            agents = emptyList(),
            folderId = folderId
        )

    private fun show(state: ProjectsUiState = this.state) = compose.setContent {
        LpmTheme {
            ProjectsScreen(
                state = state,
                refreshing = false,
                onRefresh = {},
                onExitDemo = { events += "exit" },
                menuActions = ProjectsMenuActions(
                    settings = { events += "settings" },
                    newFolder = { events += "new folder" },
                    automations = { events += "automations" },
                    addProject = { events += "add project" }
                ),
                rowActions = ProjectRowActions(
                    open = { events += "open ${it.name}" },
                    duplicate = { events += "duplicate ${it.name}" },
                    move = { p, f -> events += "move ${p.name} to $f" },
                    setPinned = { p, on -> events += "pin ${p.name} $on" }
                ),
                folderActions = FolderActions(
                    toggle = { f, open -> events += "toggle ${f.name} $open" }
                ),
                onCloseTip = { events += "close ${it.name}" }
            )
        }
    }

    @Test
    fun tappingAProjectOpensItAndAFolderShutsIt() {
        show()
        compose.onNodeWithText("storefront").performClick()
        compose.onNodeWithText("Client Work").performClick()
        assertEquals(listOf("open storefront", "toggle Client Work true"), events)
    }

    @Test
    fun theMoreMenuCountsAutomationsAndLeadsOn() {
        show()
        compose.onNodeWithContentDescription("More — automations have new messages").performClick()
        compose.onNodeWithText("Automations (2)").assertExists()
        compose.onNodeWithText("Settings").performClick()
        compose.onNodeWithContentDescription("More — automations have new messages").performClick()
        compose.onNodeWithText("New Folder…").performScrollTo().performClick()
        assertEquals(listOf("settings", "new folder"), events)
    }

    @Test
    fun aLongPressOffersTheRowsMenu() {
        show()
        compose.onNodeWithText("blog").performTouchInput { longClick() }
        compose.onNodeWithText("Status").assertExists()
        compose.onNodeWithText("Move to folder").performClick()
        compose.onNodeWithText("No folder").performClick()
        compose.onNodeWithText("blog").performTouchInput { longClick() }
        compose.onNodeWithText("Duplicate").performClick()
        assertEquals(listOf("move blog to null", "duplicate blog"), events)
    }

    @Test
    fun theDemoBannerLeadsOut() {
        show()
        compose.onNodeWithText("Demo — sample projects").assertExists()
        compose.onNodeWithText("Exit").performClick()
        assertEquals(listOf("exit"), events)
    }

    @Test
    fun anEmptyLoadedListSaysSo() {
        show(ProjectsUiState(loaded = true, listIsEmpty = true))
        compose.onNodeWithText("No projects yet").assertExists()
        compose.onNodeWithText("Add Project").performClick()
        assertEquals(listOf("add project"), events)
    }

    @Test
    fun pinnedProjectsShowAboveTheListWithTheirMenu() {
        val pinned = entry("blog", folderId = "g1").copy(pinned = true, pinLink = true)
        show(
            state.copy(
                pinned = listOf(pinned),
                rows = state.rows.map {
                    if (it is ProjectsListRow.ProjectEntry) {
                        it.copy(
                            pinned =
                                it.project.name == "blog"
                        )
                    } else {
                        it
                    }
                }
            )
        )
        compose.onNodeWithText("Pinned").assertExists()
        compose.onNodeWithText("Projects").assertExists()
        compose.onAllNodesWithText("blog")[0].performTouchInput { longClick() }
        compose.onNodeWithText("Unpin").performClick()
        compose.onNodeWithText("storefront").performTouchInput { longClick() }
        compose.onNodeWithText("Pin to top").performClick()
        assertEquals(listOf("pin blog false", "pin storefront true"), events)
    }

    @Test
    fun aTipShowsAtTheTopUntilItsClosed() {
        show(state.copy(tip = AppTip.ProjectMenu))
        compose.onNodeWithText("Hold a project for more").assertExists()
        compose.onNodeWithContentDescription("Close tip").performClick()
        assertEquals(listOf("close ProjectMenu"), events)
    }
}

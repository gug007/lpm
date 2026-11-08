package cx.lpm.mobile.feature.projects.detail

import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTouchInput
import cx.lpm.mobile.core.data.link.QueuedAction
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.CiCheck
import cx.lpm.mobile.core.model.GitChecks
import cx.lpm.mobile.core.model.GitFile
import cx.lpm.mobile.core.model.GitSnapshot
import cx.lpm.mobile.core.model.Service
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.feature.projects.project
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ProjectDetailScreenTest {
    @get:Rule
    val compose = createComposeRule()

    private val events = mutableListOf<String>()
    private val terminal =
        TerminalInfo("t1", "Terminal 1", "storefront", 80, 24, false, false, "", "")

    private val state = ProjectDetailUiState(
        project = project("storefront", running = true, services = listOf("web", "api", "worker")),
        title = "storefront",
        subtitle = DetailSubtitle.Running,
        tabs = listOf(TabEntry(terminal, null)),
        services = listOf(
            ServiceEntry(Service("web", 3000), running = true, pending = false),
            ServiceEntry(Service("api", 4000), running = true, pending = false),
            ServiceEntry(Service("worker", 0), running = false, pending = false)
        )
    )

    private fun show(state: ProjectDetailUiState = this.state) = compose.setContent {
        LpmTheme {
            ProjectDetailScreen(
                state = state,
                refreshing = false,
                onRefresh = {},
                actions = ProjectDetailActions(
                    openTerminal = { events += "open ${it.label}" },
                    newTerminal = { events += "new" },
                    toggleService = { events += "toggle ${it.name}" },
                    restartService = { events += "restart ${it.name}" },
                    stopService = { events += "stop ${it.name}" },
                    cancelQueued = { events += "cancel" },
                    openLogs = { events += "logs ${it.name}" },
                    stopAll = { events += "stop all" },
                    openBranch = { events += "branch" },
                    openChanges = { events += "changes" },
                    openChecks = { events += "checks" }
                )
            )
        }
    }

    @Test
    fun servicesToggleOpenLogsAndStopAll() {
        show()
        compose.onNodeWithText("Running").assertExists()
        compose.onNodeWithText("SERVICES · 2 OF 3 RUNNING").assertExists()
        compose.onNodeWithText("Tap a service for its logs.").assertExists()
        compose.onNodeWithContentDescription("worker").performClick()
        compose.onNodeWithText("web").performClick()
        compose.onNodeWithText("Stop all").performClick()
        assertEquals(listOf("toggle worker", "logs web", "stop all"), events)
    }

    @Test
    fun theTitleCarriesTheProjectsChanges() {
        val files = List(4) { GitFile("f$it.ts", "modified", staged = false, stamp = "") }
        show(
            state.copy(
                git = GitSnapshot(
                    isRepo = true,
                    branch = "main",
                    detached = false,
                    hasUpstream = true,
                    ahead = 0,
                    behind = 0,
                    defaultBranch = "main",
                    ghCli = false,
                    files = files,
                    autoPulled = null,
                    linesAdded = 412,
                    linesRemoved = 87
                )
            )
        )
        compose.onNodeWithText("storefront").assertExists()
        compose.onNodeWithText("+412").assertExists()
        compose.onNodeWithText("−87").assertExists()
        compose.onNodeWithText("4 files").assertExists()
    }

    @Test
    fun tabsOpenAndANewOneWaitsWhileCreating() {
        show()
        compose.onNode(hasText("Terminal 1") and hasClickAction()).performClick()
        compose.onNodeWithText("New tab").performClick()
        assertEquals(listOf("open Terminal 1", "new"), events)
    }

    @Test
    fun newTabIsOffWhileOneIsOnItsWay() {
        show(state.copy(creating = true))
        compose.onNodeWithText("New tab").assertIsNotEnabled()
    }

    @Test
    fun anEndedServiceSaysHowAndOffersRestart() {
        val crashed = Service("api", 4000, exited = true, exitCode = 1)
        show(
            state.copy(
                subtitle = DetailSubtitle.Crashed(listOf(crashed)),
                services = listOf(
                    ServiceEntry(Service("web", 3000), running = true, pending = false),
                    ServiceEntry(crashed, running = false, pending = false, ended = crashed)
                ),
                canStopServices = true
            )
        )
        compose.onNodeWithText("api exited with code 1").assertExists()
        compose.onNodeWithText("exited with code 1").assertExists()
        compose.onNodeWithContentDescription("Restart api").performClick()
        compose.onNodeWithText("api").performTouchInput { longClick() }
        compose.onNodeWithText("Stop").performClick()
        assertEquals(listOf("restart api", "stop api"), events)
    }

    @Test
    fun anActionWaitingForTheMacShowsOverTheTabs() {
        show(state.copy(queued = listOf(QueuedAction("storefront", "Start", Instant.EPOCH))))
        compose.onNodeWithText("Start · waiting for the Mac").assertExists()
        compose.onNodeWithText("Cancel").performClick()
        assertEquals(listOf("cancel"), events)
    }

    @Test
    fun nothingToListOffersANewTerminal() {
        show(state.copy(tabs = emptyList(), services = emptyList()))
        compose.onNodeWithText("No Terminals").assertExists()
        compose.onNodeWithText("New Terminal").performClick()
        assertEquals(listOf("new"), events)
    }

    private fun snapshot(
        files: Int = 4,
        ahead: Int = 2,
        detached: Boolean = false,
        isRepo: Boolean = true
    ) = GitSnapshot(
        isRepo = isRepo,
        branch = "feat/checkout-redesign",
        detached = detached,
        hasUpstream = true,
        ahead = ahead,
        behind = 0,
        defaultBranch = "main",
        ghCli = true,
        files = List(files) { GitFile("f$it.ts", "modified", staged = false, stamp = "") },
        autoPulled = null,
        linesAdded = 52,
        linesRemoved = 5
    )

    private val failing = GitChecks(
        branch = "feat/checkout-redesign",
        pr = GitChecks.PullRequest(42, "https://github.com/o/r/pull/42", "Checkout"),
        commit = null,
        checks = listOf(
            CiCheck("test", "CI", CiCheck.State.FAIL, ""),
            CiCheck("lint", "CI", CiCheck.State.PASS, "")
        ),
        fixPrompt = null
    )

    @Test
    fun theGitSectionReadsEachRowAsOneLineAndOpensWhatTheMenuOpens() {
        show(state.copy(git = snapshot(), checks = failing))
        compose.onNodeWithText("GIT").assertExists()
        listOf(
            "feat/checkout-redesign, 2 to push",
            "Changes, +52 −5 · 4 files",
            "CI on #42, 1 failing"
        ).forEach { compose.onNodeWithContentDescription(it).performScrollTo().performClick() }
        compose.onNodeWithText("1 failing").assertDoesNotExist()
        compose.onNodeWithText("storefront").performClick()
        assertEquals(listOf("branch", "changes", "checks", "changes"), events)
    }

    @Test
    fun aCleanDetachedTreeReadsSoAndItsTitleOpensNothing() {
        show(state.copy(git = snapshot(files = 0, ahead = 0, detached = true)))
        compose.onNodeWithContentDescription("Detached HEAD").assertExists()
        compose.onNodeWithContentDescription("Changes, None").assertExists()
        compose.onNodeWithContentDescription("CI", substring = true).assertDoesNotExist()
        compose.onNodeWithText("storefront").performClick()
        assertEquals(emptyList<String>(), events)
    }

    @Test
    fun noGitSectionOutsideARepositoryOrBehindNoTerminals() {
        show(state.copy(git = snapshot(isRepo = false)))
        compose.onNodeWithText("GIT").assertDoesNotExist()
    }

    @Test
    fun noGitSectionUntilTheTabsAreIn() {
        show(state.copy(tabs = null, git = snapshot()))
        compose.onNodeWithText("GIT").assertDoesNotExist()
    }
}

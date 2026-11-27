package cx.lpm.mobile.feature.projects.menu

import androidx.compose.foundation.layout.Box
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import cx.lpm.mobile.core.designsystem.component.ContextMenu
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.AutoPullMode
import cx.lpm.mobile.core.model.GitAutoKind
import cx.lpm.mobile.core.model.TerminalViewChoice
import cx.lpm.mobile.core.model.TerminalViewMode
import cx.lpm.mobile.core.model.WorkState
import cx.lpm.mobile.core.model.WorkStatusInput
import cx.lpm.mobile.core.model.builtInWorkStatuses
import cx.lpm.mobile.feature.projects.project
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ProjectMenuItemsTest {
    @get:Rule
    val compose = createComposeRule()

    private val events = mutableListOf<String>()
    private val storefront = project("storefront", running = true)

    private fun show(state: ProjectMenuUiState) = compose.setContent {
        LpmTheme {
            Box {
                ContextMenu(expanded = true, onDismissRequest = {}) {
                    ProjectMenuItems(
                        state = state,
                        project = storefront,
                        actions = ProjectMenuActions(
                            stop = { events += "stop" },
                            reviewChanges = { events += "review" },
                            pickStatus = { events += "status ${it?.label}" },
                            git = GitMenuActions(
                                pull = { events += "pull" },
                                setAutoPull = { events += "autoPull $it" }
                            )
                        )
                    )
                }
            }
        }
    }

    @Test
    fun theMenuReadsLikeIos() {
        show(ProjectMenuUiState(changedCount = 4, unreadAutomations = 1))
        listOf(
            "Stop", "Review Changes", "4 changed files", "Git", "Memory", "Notes", "Automations",
            "1 with new runs", "Status", "Rename…", "Configure…", "Terminal Settings"
        )
            .forEach { compose.onNodeWithText(it).assertExists() }
        compose.onNodeWithText("Review Changes").performClick()
        assertEquals(listOf("review"), events)
    }

    @Test
    fun anAgentsTabLeadsWithItsView() {
        compose.setContent {
            LpmTheme {
                Box {
                    ContextMenu(expanded = true, onDismissRequest = {}) {
                        ProjectMenuItems(
                            state = ProjectMenuUiState(),
                            project = storefront,
                            actions = ProjectMenuActions(
                                view = TerminalViewChoice(TerminalViewMode.Terminal) {
                                    events += it.id
                                }
                            )
                        )
                    }
                }
            }
        }
        compose.onNodeWithText("View").assertExists()
        compose.onNodeWithText("Terminal").assertExists()
        compose.onNodeWithText("Conversation").performClick()
        assertEquals(listOf("conversation"), events)
    }

    @Test
    fun aTabWithoutAConversationHasNoView() {
        show(ProjectMenuUiState())
        compose.onNodeWithText("View").assertDoesNotExist()
        compose.onNodeWithText("Conversation").assertDoesNotExist()
    }

    @Test
    fun aPausedAgentsTabMarksItFinishedAfterFind() {
        compose.setContent {
            LpmTheme {
                Box {
                    ContextMenu(expanded = true, onDismissRequest = {}) {
                        ProjectMenuItems(
                            state = ProjectMenuUiState(),
                            project = storefront,
                            actions = ProjectMenuActions(
                                find = { events += "find" },
                                finishPaused = { events += "finish" }
                            )
                        )
                    }
                }
            }
        }
        compose.onNodeWithText("Find in Terminal").assertExists()
        compose.onNodeWithText("Mark as finished").performClick()
        assertEquals(listOf("finish"), events)
    }

    @Test
    fun withoutAPausedAgentThereIsNothingToMarkFinished() {
        show(ProjectMenuUiState())
        compose.onNodeWithText("Mark as finished").assertDoesNotExist()
    }

    @Test
    fun filesAndResumeFollowReviewChangesWhenTheMacOffersThem() {
        compose.setContent {
            LpmTheme {
                Box {
                    ContextMenu(expanded = true, onDismissRequest = {}) {
                        ProjectMenuItems(
                            state = ProjectMenuUiState(),
                            project = storefront,
                            actions = ProjectMenuActions(
                                files = { events += "files" },
                                resumeSession = { events += "resume" }
                            )
                        )
                    }
                }
            }
        }
        compose.onNodeWithText("Files").performClick()
        compose.onNodeWithText("Resume Session…").performClick()
        assertEquals(listOf("files", "resume"), events)
    }

    @Test
    fun filesAndResumeHideWithoutTheirFlags() {
        show(ProjectMenuUiState())
        compose.onNodeWithText("Files").assertDoesNotExist()
        compose.onNodeWithText("Resume Session…").assertDoesNotExist()
    }

    @Test
    fun statusPicksFromTheMacsOrder() {
        show(ProjectMenuUiState(statusChoices = builtInWorkStatuses))
        compose.onNodeWithText("Status").performScrollTo().performClick()
        compose.onNodeWithText("⏳  In progress").assertExists()
        compose.onNodeWithText("⛔  Blocked").performScrollTo().performClick()
        assertEquals(listOf("status Blocked"), events)
    }

    @Test
    fun gitOpsWaitWhileInFlight() {
        show(ProjectMenuUiState(pulling = true, changedCount = 0))
        compose.onNodeWithText("Git").performClick()
        compose.onNode(hasText("Pull") and hasClickAction()).assertIsNotEnabled()
        compose.onNode(hasText("Discard All Changes…") and hasClickAction())
            .performScrollTo()
            .assertIsNotEnabled()
    }

    @Test
    fun aRunningAutoCommitReopensFromAnyAiItem() {
        show(ProjectMenuUiState(changedCount = 0, ghCli = true, autoRunning = GitAutoKind.Commit))
        compose.onNodeWithText("Git").performClick()
        compose.onNode(hasText("Running… tap to view") and hasClickAction())
            .performScrollTo()
            .assertIsEnabled()
        compose.onNode(hasText("AI writes the message, commits, and pushes") and hasClickAction())
            .assertIsEnabled()
    }

    @Test
    fun withNothingRunningTheCommitItemsNeedChanges() {
        show(ProjectMenuUiState(changedCount = 0, ghCli = true))
        compose.onNodeWithText("Git").performClick()
        compose.onNode(hasText("AI writes the message, then commits") and hasClickAction())
            .performScrollTo()
            .assertIsNotEnabled()
        compose.onNode(
            hasText("AI names the branch, commits, pushes, and opens the PR") and hasClickAction()
        )
            .assertIsEnabled()
    }

    @Test
    fun autoPullShowsItsTitleAloneAndChecksTheChoiceInEffect() {
        show(ProjectMenuUiState(autoPullMode = AutoPullMode.All, changedCount = 0))
        compose.onNodeWithText("Git").performClick()
        compose.onNode(hasText("Auto Pull") and hasText("Default (On)")).assertDoesNotExist()
        compose.onNodeWithText("Auto Pull").performClick()
        compose.onNode(hasText("Default (On)") and hasContentDescription("selected"))
            .assertExists()
        compose.onNodeWithText("Off").performClick()
        assertEquals(listOf("autoPull false"), events)
    }

    @Test
    fun autoPullIsDimmedWhileTheMacHasItOff() {
        show(ProjectMenuUiState(autoPullMode = AutoPullMode.Off, changedCount = 0))
        compose.onNodeWithText("Git").performClick()
        compose.onNode(hasText("Auto Pull") and hasClickAction()).assertIsNotEnabled()
    }

    @Test
    fun aBlockedNoteIsSavedWithTheStatus() {
        var saved: WorkStatusInput? = null
        val blocked = builtInWorkStatuses.single { it.input.state == WorkState.Blocked }
        compose.setContent {
            LpmTheme {
                WorkStatusNotePrompt(storefront, blocked, onSave = { saved = it }, onDismiss = {})
            }
        }
        compose.onNodeWithText(
            "What is blocking storefront? It shows under the name in the projects list."
        )
            .assertExists()
        compose.onNodeWithText("Waiting on…").performTextInput("API keys")
        compose.onNodeWithText("Save").performClick()
        assertEquals(WorkStatusInput(WorkState.Blocked, note = "API keys"), saved)
    }
}

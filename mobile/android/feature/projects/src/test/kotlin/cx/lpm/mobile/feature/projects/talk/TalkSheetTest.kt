package cx.lpm.mobile.feature.projects.talk

import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import cx.lpm.mobile.core.data.dictation.DictationMeter
import cx.lpm.mobile.core.data.dictation.DictationPhase
import cx.lpm.mobile.core.data.dictation.DictationState
import cx.lpm.mobile.core.data.talk.TalkPhase
import cx.lpm.mobile.core.data.talk.TalkState
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.TalkPlace
import cx.lpm.mobile.core.model.TalkPlan
import cx.lpm.mobile.core.ui.dictation.FieldDictation
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class TalkSheetTest {
    @get:Rule
    val compose = createComposeRule()

    private val events = mutableListOf<String>()

    private val projects = listOf(
        TalkChoice("api-gateway", "api-gateway"),
        TalkChoice("storefront", "Store"),
        TalkChoice("blog", "blog")
    )
    private val agents = listOf(TalkChoice("claude", "Claude Code"), TalkChoice("codex", "Codex"))

    private fun plan(project: String = "storefront", place: TalkPlace = TalkPlace.Copy) =
        TalkPlan(project, place, agent = "claude", prompt = "Fix the cart badge", label = "talk")

    private fun planned(plan: TalkPlan, running: Boolean = false, runError: String? = null) =
        TalkState(
            open = true,
            phase = TalkPhase.Plan,
            plan = plan,
            running = running,
            runError = runError
        )

    private fun show(talk: TalkState, dictation: DictationState = DictationState()) =
        compose.setContent {
            LpmTheme {
                TalkSheetContent(
                    state = TalkUiState(offered = true, talk, projects, agents),
                    dictation = FieldDictation(
                        state = dictation,
                        owner = TalkViewModel.DICTATION_OWNER,
                        meter = DictationMeter(),
                        start = { events += "dictate" },
                        stop = { events += "stop" },
                        cancel = { events += "cancel dictation" }
                    ),
                    actions = TalkSheetActions(
                        setText = { events += "text $it" },
                        makePlan = { events += "make plan" },
                        tryAgain = { events += "try again" },
                        close = { events += "close" },
                        plan = TalkPlanActions(
                            setProject = { events += "project $it" },
                            setAgent = { events += "agent $it" },
                            setPrompt = { events += "prompt $it" },
                            approve = { events += "approve" }
                        )
                    )
                )
            }
        }

    @Test
    fun askingWaitsForASentence() {
        show(TalkState(open = true))
        compose.onNodeWithText("What should I do?").assertExists()
        compose.onNodeWithText("Say or type what to do").assertExists()
        compose.onNodeWithText("Make a plan").assertIsNotEnabled()
        compose.onNodeWithContentDescription("Dictate").performClick()
        compose.onNodeWithText("Cancel").performClick()
        assertEquals(listOf("dictate", "close"), events)
    }

    @Test
    fun aTypedSentenceCanBePlanned() {
        show(TalkState(open = true, text = "Fix the cart badge"))
        compose.onNodeWithText("Fix the cart badge").assertExists()
        compose.onNodeWithText("Make a plan").assertIsEnabled().performClick()
        assertEquals(listOf("make plan"), events)
    }

    @Test
    fun aTakeShowsItsWordsAndAStop() {
        val take = DictationState(
            phase = DictationPhase.Recording,
            owner = TalkViewModel.DICTATION_OWNER,
            startedAt = 0,
            heard = "Run the tests"
        )
        show(TalkState(open = true), take)
        compose.onNodeWithText("Run the tests").assertExists()
        compose.onNodeWithText("Make a plan").assertIsNotEnabled()
        compose.onNodeWithContentDescription("Dictate").assertDoesNotExist()
        compose.onNodeWithContentDescription("Cancel dictation").performClick()
        compose.onNodeWithContentDescription("Stop and insert").performClick()
        assertEquals(listOf("cancel dictation", "stop"), events)
    }

    @Test
    fun planningShowsTheSentenceBeingSorted() {
        show(TalkState(open = true, phase = TalkPhase.Planning, text = "  Fix the cart badge \n"))
        compose.onNodeWithText("Fix the cart badge").assertExists()
        compose.onNodeWithText("Making the plan…").assertExists()
        compose.onNodeWithText("Cancel").performClick()
        assertEquals(listOf("close"), events)
    }

    @Test
    fun aCopyIsThreeSteps() {
        show(planned(plan()))
        compose.onNodeWithText("Run this plan?").assertExists()
        compose.onNodeWithText("3 steps").assertExists()
        compose.onNodeWithText("Duplicate").assertExists()
        compose.onNodeWithText("Store").assertExists()
        compose.onNodeWithText("Start").assertExists()
        compose.onNodeWithText("Claude Code, in the copy").assertExists()
        compose.onNodeWithText("Send").assertExists()
        compose.onNodeWithText("Fix the cart badge").assertExists()
        compose.onNodeWithText("Nothing runs until you approve").assertExists()
        compose.onNodeWithText("Approve").assertIsEnabled().performClick()
        assertEquals(listOf("approve"), events)
    }

    @Test
    fun aPlanInTheProjectItselfIsTwo() {
        show(planned(plan(place = TalkPlace.Here)))
        compose.onNodeWithText("2 steps").assertExists()
        compose.onNodeWithText("In").assertExists()
        compose.onNodeWithText("Claude Code").assertExists()
    }

    @Test
    fun aPlanWithoutAProjectAsksWhichBeforeItRuns() {
        show(planned(plan(project = "", place = TalkPlace.Here)))
        compose.onNodeWithText("Which project?").assertExists()
        compose.onNodeWithText("Approve").assertIsNotEnabled()
        compose.onAllNodesWithText("Change")[0].performClick()
        compose.onNodeWithText("api-gateway").assertExists()
        compose.onNodeWithText("Store").performClick()
        assertEquals(listOf("project storefront"), events)
    }

    @Test
    fun theAgentChangesFromItsMenuWithThePlansOneChecked() {
        show(planned(plan()))
        compose.onAllNodesWithText("Change")[1].performClick()
        compose.onNode(hasText("Claude Code") and hasContentDescription("selected")).assertExists()
        compose.onNodeWithText("Codex").performClick()
        assertEquals(listOf("agent codex"), events)
    }

    @Test
    fun editTurnsThePromptIntoAFieldWithTheCursorAtItsEnd() {
        show(planned(plan()))
        compose.onNodeWithText("Edit").performClick()
        compose.onNodeWithText("Done").assertExists()
        compose.onNode(hasSetTextAction()).performTextInput(" Then commit.")
        assertEquals(listOf("prompt Fix the cart badge Then commit."), events)
    }

    @Test
    fun aRunOnItsWayLocksThePlan() {
        show(planned(plan(), running = true))
        compose.onNodeWithText("Approve").assertIsNotEnabled()
        compose.onAllNodesWithText("Change")[0].assertIsNotEnabled()
        compose.onNodeWithText("Edit").assertIsNotEnabled()
    }

    @Test
    fun aRefusedRunSaysWhyOverApprove() {
        show(planned(plan(), runError = "That project isn't available."))
        compose.onNodeWithText("That project isn't available.").assertExists()
        compose.onNodeWithText("Approve").assertIsEnabled()
    }

    @Test
    fun aRequestAPlanCannotDoSaysSo() {
        show(
            TalkState(
                open = true,
                phase = TalkPhase.Failed(unsupported = true, "A plan can only duplicate a project.")
            )
        )
        compose.onNodeWithText("I can't do that from here").assertExists()
        compose.onNodeWithText("A plan can only duplicate a project.").assertExists()
        compose.onNodeWithText("Try again").performClick()
        assertEquals(listOf("try again"), events)
    }

    @Test
    fun aFailedPlanOffersAnotherTry() {
        show(
            TalkState(
                open = true,
                phase = TalkPhase.Failed(unsupported = false, "The Mac didn't answer in time.")
            )
        )
        compose.onNodeWithText("Couldn't make the plan").assertExists()
        compose.onNodeWithText("The Mac didn't answer in time.").assertExists()
    }
}

package cx.lpm.mobile.feature.projects.ci

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.CiCheck
import cx.lpm.mobile.core.model.GitChecks
import cx.lpm.mobile.core.model.GitMergeMethod
import cx.lpm.mobile.core.model.GitMergeOffer
import cx.lpm.mobile.core.model.MergedPullRequest
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class GitMergeSectionTest {
    @get:Rule
    val compose = createComposeRule()

    private val events = mutableListOf<String>()

    private fun offer(state: String = "CLEAN", deletesBranch: Boolean = false) = GitMergeOffer(
        mergeable = "MERGEABLE",
        state = state,
        review = "APPROVED",
        head = "4b8e2f1",
        methods = GitMergeMethod.entries,
        deletesBranch = deletesBranch
    )

    private fun checks(offer: GitMergeOffer, state: CiCheck.State = CiCheck.State.PASS) = GitChecks(
        branch = "feat/x",
        pr = GitChecks.PullRequest(42, "https://github.com/o/r/pull/42", "Checkout", merge = offer),
        commit = null,
        checks = listOf(CiCheck("test", "CI", state, "")),
        fixPrompt = null
    )

    private fun show(state: GitChecksUiState) = compose.setContent {
        LpmTheme {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                state.merged?.let { GitMergedSection(it) }
                GitMergeSection(
                    state,
                    state.checks!!,
                    CiMergeActions(
                        merge = { method, delete -> events += "merge ${method.wire} $delete" },
                        pickMethod = { events += "pick ${it.wire}" },
                        reload = { events += "reload" }
                    )
                )
            }
        }
    }

    private fun mergeButton() = compose.onNode(hasText("Merge #42") and hasClickAction())

    @Test
    fun readyOffersTheMethodDeleteBranchAndMerge() {
        show(GitChecksUiState(available = true, canMerge = true, checks = checks(offer())))
        compose.onNodeWithText("Ready to merge").assertExists()
        compose.onNodeWithText("All checks passed · Approved · No conflicts").assertExists()
        compose.onNodeWithText("Method").assertExists()
        compose.onNodeWithText("Squash and merge").assertExists()
        mergeButton().performScrollTo().performClick()
        compose.onNodeWithContentDescription("Delete branch").performScrollTo().performClick()
        mergeButton().performScrollTo().performClick()
        assertEquals(listOf("merge squash true", "merge squash false"), events)
    }

    @Test
    fun aRepositoryThatDeletesMergedBranchesSaysSo() {
        val state = GitChecksUiState(
            canMerge = true,
            checks = checks(offer(deletesBranch = true)),
            mergeMethod = "rebase"
        )
        show(state)
        compose.onNodeWithText("Delete branch").assertDoesNotExist()
        compose.onNodeWithText("GitHub deletes the branch once it's merged.").assertExists()
        compose.onNodeWithText("Rebase and merge").assertExists()
        mergeButton().performScrollTo().performClick()
        assertEquals(listOf("merge rebase true"), events)
    }

    @Test
    fun whileMergingTheButtonSpinsAndAnErrorShowsInRed() {
        show(
            GitChecksUiState(
                canMerge = true,
                checks = checks(offer()),
                merging = true,
                mergeError = "Head moved"
            )
        )
        mergeButton().assertIsNotEnabled()
        compose.onNodeWithText("Head moved").assertExists()
    }

    @Test
    fun runningChecksWaitAndFailingOnesLeaveItOut() {
        show(
            GitChecksUiState(
                canMerge = true,
                checks = checks(offer(), CiCheck.State.PENDING)
            )
        )
        compose.onNodeWithText("Waiting for checks").assertExists()
        compose.onNodeWithText("It can merge once every check has finished.").assertExists()
        compose.onNodeWithText("Merge #42").assertDoesNotExist()
    }

    @Test
    fun anUnknownStateAsksAgainAfterThreeSeconds() {
        compose.mainClock.autoAdvance = false
        show(GitChecksUiState(canMerge = true, checks = checks(offer(state = "UNKNOWN"))))
        compose.mainClock.advanceTimeByFrame()
        compose.onNodeWithText("Checking the pull request").assertExists()
        compose.mainClock.advanceTimeBy(2_000)
        assertEquals(emptyList<String>(), events)
        compose.mainClock.advanceTimeBy(1_500)
        assertEquals(listOf("reload"), events)
    }

    @Test
    fun aMacThatCantMergeShowsNothing() {
        show(GitChecksUiState(canMerge = false, checks = checks(offer())))
        compose.onNodeWithText("Ready to merge").assertDoesNotExist()
    }

    @Test
    fun aMergeJustMadeTakesTheSectionsPlace() {
        show(
            GitChecksUiState(
                canMerge = true,
                checks = checks(offer()),
                merged = MergedPullRequest(42, "Checkout", deletedBranch = true)
            )
        )
        compose.onNodeWithText("Merged #42").assertExists()
        compose.onNodeWithText("Checkout").assertExists()
        compose.onNodeWithText(
            "Its branch was deleted on GitHub. The branch on your Mac is still checked out."
        ).assertExists()
        compose.onNodeWithText("Ready to merge").assertDoesNotExist()
    }
}

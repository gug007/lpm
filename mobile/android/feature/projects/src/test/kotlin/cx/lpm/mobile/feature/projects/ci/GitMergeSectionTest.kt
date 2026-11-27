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
import cx.lpm.mobile.core.model.GitMergeWatch
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

    private fun offer(
        state: String = "CLEAN",
        deletesBranch: Boolean = false,
        canBypass: Boolean = false
    ) = GitMergeOffer(
        mergeable = "MERGEABLE",
        state = state,
        review = "APPROVED",
        head = "4b8e2f1",
        methods = GitMergeMethod.entries,
        deletesBranch = deletesBranch,
        canBypass = canBypass,
        base = "main"
    )

    private fun checks(
        offer: GitMergeOffer,
        state: CiCheck.State = CiCheck.State.PASS,
        mergeWatch: GitMergeWatch? = null
    ) = GitChecks(
        branch = "feat/x",
        pr = GitChecks.PullRequest(42, "https://github.com/o/r/pull/42", "Checkout", merge = offer),
        commit = null,
        checks = listOf(CiCheck("test", "CI", state, "")),
        fixPrompt = null,
        mergeWatch = mergeWatch
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
                        bypass = { method, delete -> events += "bypass ${method.wire} $delete" },
                        mergeWhenReady = { method, delete, bypass ->
                            events += "wait ${method.wire} $delete $bypass"
                        },
                        cancelWhenReady = { events += "cancel" },
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

    @Test
    fun runningChecksOfferMergeWhenChecksPass() {
        show(
            GitChecksUiState(
                canMerge = true,
                canMergeWhenReady = true,
                checks = checks(offer(state = "UNSTABLE"), CiCheck.State.PENDING)
            )
        )
        compose.onNodeWithText("Waiting for checks").assertExists()
        compose.onNodeWithText("Method").assertExists()
        compose.onNodeWithText("lpm merges once the running check passes.").assertExists()
        compose.onNodeWithText("Merge #42").assertDoesNotExist()
        compose.onNodeWithText("Bypass Rules and Merge").assertDoesNotExist()
        compose.onNode(hasText("Merge When Checks Pass") and hasClickAction())
            .performScrollTo()
            .performClick()
        assertEquals(listOf("wait squash true false"), events)
    }

    @Test
    fun runningChecksHeldByRulesWaitPastThemOrBypassNow() {
        show(
            GitChecksUiState(
                canMerge = true,
                canMergeWhenReady = true,
                checks = checks(offer(state = "BLOCKED", canBypass = true), CiCheck.State.PENDING)
            )
        )
        compose.onNodeWithText(
            "lpm merges once the running check passes, bypassing the rules on main if they " +
                "still block it."
        ).assertExists()
        compose.onNode(hasText("Merge When Checks Pass") and hasClickAction())
            .performScrollTo()
            .performClick()
        compose.onNode(hasText("Bypass Rules and Merge") and hasClickAction())
            .performScrollTo()
            .performClick()
        assertEquals(listOf("wait squash true true", "bypass squash true"), events)
    }

    @Test
    fun blockedByRulesOffersBypass() {
        show(
            GitChecksUiState(
                canMerge = true,
                canMergeWhenReady = true,
                checks = checks(offer(state = "BLOCKED", canBypass = true))
            )
        )
        compose.onNodeWithText("Can't merge yet").assertExists()
        compose.onNodeWithText(
            "Bypassing merges it now, past the rules on main, as GitHub's Bypass requirements does."
        ).assertExists()
        compose.onNodeWithText("Merge When Checks Pass").assertDoesNotExist()
        compose.onNodeWithContentDescription("Delete branch").performScrollTo().performClick()
        compose.onNode(hasText("Bypass Rules and Merge") and hasClickAction())
            .performScrollTo()
            .performClick()
        assertEquals(listOf("bypass squash false"), events)
    }

    @Test
    fun aMacWithoutWhenReadyOffersNeither() {
        show(
            GitChecksUiState(
                canMerge = true,
                checks = checks(offer(state = "BLOCKED", canBypass = true), CiCheck.State.PENDING)
            )
        )
        compose.onNodeWithText("Waiting for checks").assertExists()
        compose.onNodeWithText("Merge When Checks Pass").assertDoesNotExist()
        compose.onNodeWithText("Bypass Rules and Merge").assertDoesNotExist()
        compose.onNodeWithText("Method").assertDoesNotExist()
    }

    @Test
    fun anArmedWaitSaysWhatItWillDoWithCancel() {
        val watch =
            GitMergeWatch(42, "Checkout", GitMergeMethod.REBASE, deleteBranch = true, bypass = true)
        show(
            GitChecksUiState(
                canMerge = true,
                canMergeWhenReady = true,
                checks = checks(
                    offer(state = "BLOCKED", canBypass = true),
                    CiCheck.State.PENDING,
                    watch
                )
            )
        )
        compose.onNodeWithText("Merging when checks pass").assertExists()
        compose.onNodeWithText(
            "Rebase and merge once the running checks pass, bypassing the rules on main if " +
                "they still block it, then delete the branch on GitHub. Stops if a check fails."
        ).assertExists()
        compose.onNodeWithText("Waiting for checks").assertDoesNotExist()
        compose.onNodeWithText("Merge When Checks Pass").assertDoesNotExist()
        compose.onNodeWithText("lpm merges once the running check passes.").assertDoesNotExist()
        compose.onNode(
            hasText("Cancel Merge") and hasClickAction()
        ).performScrollTo().performClick()
        assertEquals(listOf("cancel"), events)
    }

    @Test
    fun whileArmingTheButtonsWait() {
        show(
            GitChecksUiState(
                canMerge = true,
                canMergeWhenReady = true,
                arming = true,
                checks = checks(offer(state = "BLOCKED", canBypass = true), CiCheck.State.PENDING)
            )
        )
        compose.onNode(hasText("Merge When Checks Pass") and hasClickAction()).assertIsNotEnabled()
        compose.onNode(hasText("Bypass Rules and Merge") and hasClickAction()).assertIsNotEnabled()
    }

    @Test
    fun aWaitForAnotherPullRequestIsNotShown() {
        val other =
            GitMergeWatch(7, "Old", GitMergeMethod.SQUASH, deleteBranch = false, bypass = false)
        show(
            GitChecksUiState(
                canMerge = true,
                canMergeWhenReady = true,
                checks = checks(offer(), CiCheck.State.PENDING, other)
            )
        )
        compose.onNodeWithText("Merging when checks pass").assertDoesNotExist()
        compose.onNodeWithText("Merge When Checks Pass").assertExists()
    }
}

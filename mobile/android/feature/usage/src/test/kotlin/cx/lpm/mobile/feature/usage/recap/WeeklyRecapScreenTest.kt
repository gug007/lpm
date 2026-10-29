package cx.lpm.mobile.feature.usage.recap

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.RecapDay
import cx.lpm.mobile.core.model.RecapPeriod
import cx.lpm.mobile.core.model.RecapPick
import cx.lpm.mobile.core.model.RecapTime
import cx.lpm.mobile.core.model.RecapWeek
import cx.lpm.mobile.core.model.WeeklyRecap
import cx.lpm.mobile.feature.usage.stats.StatsBody
import cx.lpm.mobile.feature.usage.stats.StatsScreen
import cx.lpm.mobile.feature.usage.stats.StatsUiState
import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class WeeklyRecapScreenTest {
    @get:Rule
    val compose = createComposeRule()

    private val events = mutableListOf<String>()
    private val minute = 60_000L

    private val view = recapView(
        WeeklyRecap(
            week = "2026-10-05",
            days = listOf(352L, 418L, 296L, 389L, 241L, 184L, 0L).mapIndexed { i, m ->
                RecapDay("2026-10-${"%02d".format(5 + i)}", m * minute, 30)
            },
            previousAgentMs = 1_460 * minute,
            sessions = 58,
            projects = listOf(RecapTime("a", 41), RecapTime("b", 59)),
            agents = listOf(RecapTime("claude", 64), RecapTime("codex", 36)),
            workedRepos = listOf("r"),
            linesAdded = 6_120,
            linesRemoved = 2_407
        ),
        locale = Locale.US
    )

    private fun show(state: WeeklyRecapUiState) = compose.setContent {
        LpmTheme {
            WeeklyRecapScreen(
                state = state,
                onBack = { events += "back" },
                onRefresh = {},
                onSelect = { events += "select ${it.week.wire} ${it.period.wire}" },
                onRetry = { events += "retry" }
            )
        }
    }

    @Test
    fun theCardIsTextOnScreenOnce() {
        show(
            WeeklyRecapUiState(
                body = RecapBody.Card(view, recapCaption(view), dimmed = false),
                missing = listOf("build-box")
            )
        )
        compose.onNodeWithText("Your agents' week, ready to share.").assertExists()
        listOf("My agents' week", "31h 20m", "of agents working for me", "Claude 64%, Codex 36%")
            .forEach { compose.onAllNodesWithText(it).assertCountEquals(1) }
        compose.onNodeWithText("lpm.cx").assertExists()
        compose.onNodeWithText("Share").performScrollTo().assertExists()
        compose.onNodeWithText(
            "Names no projects, and nothing is uploaded: you add the card to the post yourself."
        ).performScrollTo().assertExists()
        compose.onNodeWithText("Not counted: build-box, which couldn't send its week.")
            .assertExists()
    }

    @Test
    fun picksAWeek() {
        show(WeeklyRecapUiState())
        compose.onNodeWithText("Reading your agents' history…").assertExists()
        compose.onNodeWithText("Month").assertDoesNotExist()
        compose.onNodeWithText("This").performClick()
        assertEquals(listOf("select this week"), events)
    }

    @Test
    fun picksAMonthWhereTheMacHasThem() {
        show(WeeklyRecapUiState(months = true))
        compose.onNodeWithText("Month").performClick()
        assertEquals(listOf("select last month"), events)
    }

    @Test
    fun aMonthIsNamedAsOne() {
        show(
            WeeklyRecapUiState(
                pick = RecapPick(RecapWeek.Last, RecapPeriod.Month),
                body = RecapBody.Empty(RecapPick(RecapWeek.Last, RecapPeriod.Month)),
                missing = listOf("build-box"),
                months = true
            )
        )
        compose.onNodeWithText("Your agents' month, ready to share.").assertExists()
        compose.onNodeWithText("No agent work last month").assertExists()
        compose.onNodeWithText("Not counted: build-box, which couldn't send its month.")
            .performScrollTo()
            .assertExists()
        compose.onNodeWithText("See this month so far").performClick()
        assertEquals(listOf("select this month"), events)
    }

    @Test
    fun anEmptyLastWeekLeadsToThisWeek() {
        show(
            WeeklyRecapUiState(body = RecapBody.Empty(RecapPick(RecapWeek.Last, RecapPeriod.Week)))
        )
        compose.onNodeWithText("No agent work last week").assertExists()
        compose.onNodeWithText("See this week so far").performClick()
        assertEquals(listOf("select this week"), events)
    }

    @Test
    fun aFailureSaysWhyAndTriesAgain() {
        show(WeeklyRecapUiState(body = RecapBody.Failed("The Mac didn't answer.")))
        compose.onNodeWithText("Couldn't read the week: The Mac didn't answer.").assertExists()
        compose.onNodeWithText("Try again").performClick()
        assertEquals(listOf("retry"), events)
    }

    @Test
    fun statsOpensTheRecapFromItsTopRow() {
        compose.setContent {
            LpmTheme {
                StatsScreen(
                    state = StatsUiState(body = StatsBody.Loading, recapAvailable = true),
                    onBack = {},
                    onRefresh = {},
                    onSelect = {},
                    onRetry = {},
                    onOpenRecap = { events += "recap" }
                )
            }
        }
        compose.onNodeWithText("Weekly recap").performClick()
        assertEquals(listOf("recap"), events)
    }
}

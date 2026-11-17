package cx.lpm.mobile.feature.usage.stats

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.AgentStats
import cx.lpm.mobile.core.model.UsageBreakdown
import cx.lpm.mobile.core.model.UsageDaily
import cx.lpm.mobile.core.model.UsageSession
import cx.lpm.mobile.core.model.UsageSource
import cx.lpm.mobile.core.model.UsageTokens
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class StatsScreenTest {
    @get:Rule
    val compose = createComposeRule()

    private val events = mutableListOf<String>()
    private val now = 1_792_065_600_000L

    private fun tokens(total: Long) = UsageTokens(
        inputTokens = total - total / 50,
        cachedInputTokens = total / 2,
        cacheCreationInputTokens = 0,
        cacheCreation1hInputTokens = 0,
        cacheReadInputTokens = total / 2,
        outputTokens = total / 50,
        reasoningTokens = total / 500,
        totalTokens = total
    )

    private val stats = AgentStats(
        generatedAt = now,
        days = 7,
        sessions = 12,
        totals = tokens(9_000_000),
        providers = listOf(
            UsageBreakdown("claude", "Claude Code", 9, tokens(8_000_000), null, false),
            UsageBreakdown("codex", "Codex", 3, tokens(1_000_000), null, false)
        ),
        projects = listOf(
            UsageBreakdown("storefront", "storefront", 1, tokens(9_000_000), null, false)
        ),
        models = listOf(
            UsageBreakdown("claude-opus-4-6", "", 9, tokens(8_000_000), "claude", false)
        ),
        daily = listOf(
            UsageDaily("2026-10-14", 5_000_000, 0, 5_000_000),
            UsageDaily("2026-10-15", 3_000_000, 1_000_000, 4_000_000)
        ),
        recentSessions = listOf(
            UsageSession(
                "claude",
                "storefront",
                "claude-opus-4-6",
                now - 7_200_000,
                now - 7_200_000,
                tokens(2_000)
            )
        ),
        sources = listOf(UsageSource("claude", 1_204))
    )

    private fun show(state: StatsUiState) = compose.setContent {
        LpmTheme {
            StatsScreen(
                state = state,
                onBack = { events += "back" },
                onRefresh = {},
                onSelect = { events += "select $it" },
                onRetry = { events += "retry" }
            )
        }
    }

    @Test
    fun theLoadedStatsReadLikeTheDesktop() {
        show(StatsUiState(days = 7, body = StatsBody.Loaded(stats, dimmed = false), now = now))
        compose.onNodeWithText("TOTAL TOKENS").assertExists()
        compose.onAllNodesWithText("9.0M").assertCountEquals(2)
        compose.onNodeWithText("Peak 5.0M on Oct 14").assertExists()
        compose.onNodeWithText("Across 1 project · 1 model").assertExists()
        compose.onNodeWithText("Token activity").assertExists()
        compose.onNodeWithText("9 sessions · 89%").performScrollTo().assertExists()
        compose.onNodeWithText("Recent sessions").performScrollTo().assertExists()
        compose.onNodeWithText("1,204 local history files scanned").performScrollTo().assertExists()
    }

    @Test
    fun picksAPeriodAndGoesBack() {
        show(StatsUiState(days = 7, body = StatsBody.Loaded(stats, dimmed = false), now = now))
        compose.onNodeWithText("Today").performClick()
        compose.onNodeWithText("All time").performClick()
        compose.onNodeWithContentDescription("Back").performClick()
        assertEquals(listOf("select 1", "select 0", "back"), events)
    }

    @Test
    fun aFailureOffersToTryAgain() {
        show(StatsUiState(body = StatsBody.Failed("Couldn't load stats.")))
        compose.onNodeWithText("Couldn't load stats").assertExists()
        compose.onNodeWithText("Try Again").performClick()
        assertEquals(listOf("retry"), events)
    }

    @Test
    fun noUsageYetSaysWhereItComesFrom() {
        val empty = stats.copy(totals = tokens(0), sources = emptyList())
        show(StatsUiState(body = StatsBody.Loaded(empty, dimmed = false), now = now))
        compose.onNodeWithText("No local agent usage found").assertExists()
        compose.onNodeWithText("0 local history files scanned").assertExists()
    }
}

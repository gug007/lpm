package cx.lpm.mobile.feature.usage.usage

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.LimitWindow
import cx.lpm.mobile.core.model.ProviderLimits
import cx.lpm.mobile.core.model.USAGE_GENERIC_ERROR
import cx.lpm.mobile.core.model.UsageCard
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class UsageScreenTest {
    @get:Rule
    val compose = createComposeRule()

    private val events = mutableListOf<String>()
    private val now = 1_792_065_600_000.0

    private fun show(body: UsageBody) = compose.setContent {
        LpmTheme {
            UsageScreen(
                state = UsageUiState(body, now = now, macNow = now),
                onBack = { events += "back" },
                onRefresh = {},
                onRetry = { events += "retry" }
            )
        }
    }

    private val claude = ProviderLimits(
        provider = "claude",
        accountId = "default",
        label = "Sonnet 4.6",
        fiveHour = LimitWindow(71.0, ((now + 3 * 3_600_000) / 1000).toLong()),
        weekly = null,
        updatedAt = (now - 240_000).toLong()
    )

    @Test
    fun aCardShowsWhoReportedWhenAndBothWindows() {
        show(
            UsageBody.Loaded(
                claude = listOf(UsageCard("claude:default", claude, "Claude", "you@example.com")),
                claudeEnabled = true,
                codex = null,
                refreshError = null,
                dimmed = false
            )
        )
        compose.onNodeWithText("SONNET 4.6").assertExists()
        compose.onNodeWithText("updated 4m ago").assertExists()
        compose.onNodeWithContentDescription("Weekly window usage").assertExists()
        compose.onNodeWithContentDescription("5-hour window usage").assertExists()
        compose.onNodeWithText(
            "Codex usage appears here automatically the first time you run Codex in a project."
        ).assertExists()
        compose.onNodeWithText("Live plan usage for your AI coding tools").assertExists()
    }

    @Test
    fun claudeReportingOffSaysWhereToTurnItOn() {
        show(
            UsageBody.Loaded(
                emptyList(),
                claudeEnabled = false,
                codex = null,
                refreshError = null,
                dimmed = false
            )
        )
        compose.onNodeWithText(
            "Claude usage is off on this Mac. Turn on Read Claude usage in lpm → Settings → Accounts & usage and the meters appear here."
        ).assertExists()
    }

    @Test
    fun aFailedRefreshSaysSoOverTheLastNumbers() {
        show(
            UsageBody.Loaded(
                emptyList(),
                claudeEnabled = true,
                codex = null,
                refreshError = "The Mac is busy.",
                dimmed = false
            )
        )
        compose.onNodeWithText(
            "Couldn't refresh — these are the last numbers your Mac sent."
        ).assertExists()
        compose.onNodeWithText("The Mac is busy.").assertExists()
        compose.onNodeWithText("Try Again").performClick()
        assertEquals(listOf("retry"), events)
    }

    @Test
    fun aFirstLoadThatFailedAsksForAPull() {
        show(UsageBody.Failed(USAGE_GENERIC_ERROR))
        compose.onNodeWithText("Couldn't load usage").assertExists()
        compose.onNodeWithText("Pull to refresh.").assertExists()
        compose.onNodeWithContentDescription("Back").performClick()
        assertEquals(listOf("back"), events)
    }
}

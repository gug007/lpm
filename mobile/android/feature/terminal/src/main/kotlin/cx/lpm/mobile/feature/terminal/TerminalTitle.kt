package cx.lpm.mobile.feature.terminal

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import cx.lpm.mobile.core.data.link.LinkStatusLine
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.AgentPause
import cx.lpm.mobile.core.model.AgentState
import cx.lpm.mobile.core.model.GitSnapshot
import cx.lpm.mobile.core.ui.BarConnectionLine
import cx.lpm.mobile.core.ui.BarTitle
import cx.lpm.mobile.core.ui.barTitleLineStyle
import kotlinx.coroutines.delay

/**
 * A terminal screen's title: the tab's name, how long its agent has been at it
 * above, and the project's uncommitted changes below. The connection's status
 * takes the top line whenever the Mac isn't connected.
 */
@Composable
internal fun TerminalTitle(
    label: String,
    statusLine: LinkStatusLine?,
    agent: AgentTiming?,
    git: GitSnapshot?,
    gitLoading: Boolean,
    modifier: Modifier = Modifier
) {
    BarTitle(
        name = label,
        git = git,
        gitLoading = gitLoading,
        stale = statusLine != null,
        modifier = modifier
    ) {
        when {
            statusLine != null -> BarConnectionLine(statusLine)
            agent != null -> AgentLine(agent)
        }
    }
}

/**
 * How long the agent has been at it, with its state named when that isn't plain
 * work, in the state's color when it wants a look.
 */
@Composable
private fun AgentLine(agent: AgentTiming) {
    val colors = LpmTheme.colors
    val textColor = when (agent.state) {
        AgentState.NeedsYou -> colors.orange
        AgentState.Error -> colors.red
        else -> colors.secondaryLabel
    }
    val word = agent.state.label.takeUnless { agent.state == AgentState.Working }
    val now by produceState(agent.until ?: System.currentTimeMillis(), agent) {
        if (agent.until != null) return@produceState
        while (true) {
            delay(nextTick(value - agent.since))
            value = System.currentTimeMillis()
        }
    }
    val elapsed = preciseDuration((now - agent.since).coerceAtLeast(0) / MILLIS_PER_SECOND)
    val pause = agent.pause
    Text(
        text = when {
            pause != null -> "${AgentPause.LABEL} · ${pause.shellsLabel}"
            word != null -> "$word · $elapsed"
            else -> elapsed
        },
        style = barTitleLineStyle(FontWeight.SemiBold),
        color = textColor,
        maxLines = 1
    )
}

private const val MILLIS_PER_SECOND = 1_000L
private const val SECONDS_PER_MINUTE = 60L
private const val PRECISE_FOR_MILLIS = 3_600_000L

/** Ticks each second while the reading shows seconds (its first hour), then each minute. */
private fun nextTick(elapsed: Long): Long {
    val step = if (elapsed < PRECISE_FOR_MILLIS) {
        MILLIS_PER_SECOND
    } else {
        MILLIS_PER_SECOND * SECONDS_PER_MINUTE
    }
    return step - ((elapsed % step) + step) % step
}

/** "45s", "4m 30s", "2h 5m". */
private fun preciseDuration(secs: Long): String {
    if (secs < SECONDS_PER_MINUTE) return "${secs}s"
    val mins = secs / SECONDS_PER_MINUTE
    if (mins < SECONDS_PER_MINUTE) {
        val rest = secs % SECONDS_PER_MINUTE
        return if (rest > 0) "${mins}m ${rest}s" else "${mins}m"
    }
    val rest = mins % SECONDS_PER_MINUTE
    val hours = mins / SECONDS_PER_MINUTE
    return if (rest > 0) "${hours}h ${rest}m" else "${hours}h"
}

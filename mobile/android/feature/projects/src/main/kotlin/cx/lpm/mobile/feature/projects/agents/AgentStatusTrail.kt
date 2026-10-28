package cx.lpm.mobile.feature.projects.agents

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalTextStyle
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.AgentState
import cx.lpm.mobile.core.model.ProjectAgentRow
import cx.lpm.mobile.core.ui.ElapsedText
import cx.lpm.mobile.core.ui.pulseAlpha
import cx.lpm.mobile.core.ui.tint

/**
 * The mark a tab's row ends with: a bell while the agent waits on you, an alert for
 * a problem, a check once the turn lands. Working and idle say so through the name
 * alone, and their slot keeps its width so the clocks line up. A [seen] agent keeps
 * its mark, gray, so a finished turn still reads apart from a failed one.
 */
@Composable
fun AgentStateMark(
    state: AgentState,
    modifier: Modifier = Modifier,
    iconSize: Dp = 16.dp,
    seen: Boolean = false
) {
    Box(modifier.width(18.dp), contentAlignment = Alignment.Center) {
        val icon = when (state) {
            AgentState.NeedsYou -> R.drawable.ic_notifications_fill
            AgentState.Error -> R.drawable.ic_error_fill
            AgentState.Done -> R.drawable.ic_check
            AgentState.Working, AgentState.Idle -> null
        }
        if (icon != null) {
            val alpha = if (state == AgentState.NeedsYou && !seen) pulseAlpha() else null
            Icon(
                painter = painterResource(icon),
                contentDescription = null,
                tint = if (seen) LpmTheme.colors.secondaryLabel else state.tint,
                modifier = Modifier
                    .size(iconSize)
                    .graphicsLayer { this.alpha = alpha?.invoke() ?: 1f }
            )
        }
    }
}

/**
 * The end of a tab's row, as the desktop sidebar ends one: the state's mark, then
 * how long the agent has been at it, or how long the finished turn took.
 */
@Composable
fun AgentStatusTrail(
    agent: ProjectAgentRow,
    modifier: Modifier = Modifier,
    style: TextStyle = LocalTextStyle.current
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        AgentStateMark(
            agent.state,
            iconSize = if (style.fontSize.isSp) style.fontSize.value.dp else 16.dp,
            seen = agent.seen
        )
        agent.since?.let { since ->
            ElapsedText(
                since = since,
                until = agent.until,
                color = LpmTheme.colors.secondaryLabel,
                style = style
            )
        }
    }
}

package cx.lpm.mobile.feature.terminal.conversation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.CapsuleButton
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.AgentPause
import cx.lpm.mobile.core.model.AgentState
import cx.lpm.mobile.core.model.ProjectAgentRow
import cx.lpm.mobile.core.ui.AgentAsk
import cx.lpm.mobile.core.ui.AgentAskCard
import cx.lpm.mobile.core.ui.AgentToneText
import cx.lpm.mobile.core.ui.ElapsedText
import cx.lpm.mobile.feature.terminal.R

/**
 * How the turn stands, at the end of the list: at work, or waiting on an answer — with
 * the question to answer here when the Mac can read it.
 */
@Composable
internal fun ConversationStatus(
    agent: ProjectAgentRow,
    ask: AgentAsk?,
    actions: ConversationActions,
    modifier: Modifier = Modifier
) {
    when (agent.state) {
        AgentState.Working -> Working(agent, modifier)

        AgentState.NeedsYou -> if (ask != null) {
            AgentAskCard(
                ask = ask,
                onPick = actions.onPick,
                onOpen = actions.onShowTerminal,
                modifier = modifier
            )
        } else {
            NeedsYou(actions.onShowTerminal, modifier)
        }

        AgentState.Error, AgentState.Done, AgentState.Idle -> Unit
    }
}

@Composable
private fun Working(agent: ProjectAgentRow, modifier: Modifier = Modifier) {
    val style = LpmTheme.typography.subheadline.copy(fontWeight = FontWeight.Medium)
    val pause = agent.pause
    val since = agent.since
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        AgentToneText(
            text = if (pause != null) {
                "${AgentPause.LABEL} · ${pause.shellsLabel}"
            } else {
                AgentState.Working.label
            },
            state = agent.state,
            style = style,
            paused = pause != null
        )
        if (pause == null && since != null) {
            ElapsedText(
                since = since,
                until = agent.until,
                color = LpmTheme.colors.secondaryLabel,
                style = style
            )
        }
    }
}

@Composable
private fun NeedsYou(onShowTerminal: () -> Unit, modifier: Modifier = Modifier) {
    val colors = LpmTheme.colors
    Row(
        modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            painter = painterResource(DesignR.drawable.ic_notifications_fill),
            contentDescription = null,
            tint = colors.orange,
            modifier = Modifier.size(18.dp)
        )
        Text(
            text = AgentState.NeedsYou.label,
            modifier = Modifier.weight(1f),
            style = LpmTheme.typography.subheadline.copy(fontWeight = FontWeight.Medium),
            color = colors.orange
        )
        CapsuleButton(
            text = stringResource(R.string.conversation_show_terminal),
            onClick = onShowTerminal,
            color = colors.orange
        )
    }
}

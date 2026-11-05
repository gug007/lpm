package cx.lpm.mobile.feature.projects.list

import androidx.annotation.DrawableRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.data.agents.AgentDialogState
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ActivityIndicatorSize
import cx.lpm.mobile.core.designsystem.component.TouchTarget
import cx.lpm.mobile.core.designsystem.component.clickableTarget
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.AgentDialogOption
import cx.lpm.mobile.core.model.AgentDialogRead
import cx.lpm.mobile.feature.projects.R

/** A waiting agent's question as its row shows it: what the Mac read, and how a pick went. */
@Immutable
data class AgentAsk(
    val read: AgentDialogRead,
    /** The option on its way to the Mac. */
    val picking: String? = null,
    /** A pick reached the Mac and the agent hasn't moved on yet. */
    val answered: Boolean = false,
    /** Why the last pick didn't land. */
    val error: String? = null
) {
    val busy: Boolean get() = picking != null || answered
}

/** The question an agent waiting on [terminal] asks, once the Mac has read one off its screen. */
fun AgentDialogState.ask(terminal: String, key: String): AgentAsk? {
    val read = read(terminal, key) ?: return null
    return AgentAsk(read, picking[terminal], isAnswered(read), errors[terminal])
}

/**
 * Under an agent waiting on a choice: what it asks, read off its terminal, with the
 * agent's own options to answer from the list — the desktop sidebar's card
 * (SidebarAgentAsk.tsx), in its amber. A typed option is answered in the tab, so it
 * opens the tab too ([onOpen]).
 */
@Composable
fun AgentAskCard(
    ask: AgentAsk,
    onPick: (AgentDialogOption) -> Unit,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier
) {
    val dialog = ask.read.dialog ?: return
    val colors = LpmTheme.colors
    val typography = LpmTheme.typography
    val shape = RoundedCornerShape(12.dp)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(colors.orange.copy(alpha = 0.08f), shape)
            .border(1.dp, colors.orange.copy(alpha = 0.3f), shape)
            .padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        if (dialog.question.isNotEmpty()) {
            Text(
                text = dialog.question,
                style = typography.subheadline.copy(fontWeight = FontWeight.SemiBold),
                color = colors.label
            )
        }
        dialog.details.take(2).forEach { detail ->
            Text(
                text = detail,
                style = typography.footnote.copy(fontFamily = FontFamily.Monospace),
                color = colors.secondaryLabel,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis
            )
        }
        dialog.options.forEach { option ->
            key(option.key) {
                OptionButton(
                    option = option,
                    sending = ask.picking == option.key,
                    busy = ask.busy,
                    onClick = {
                        onPick(option)
                        if (option.typed) onOpen()
                    }
                )
            }
        }
        val error = ask.error
        if (error != null) {
            StatusLine(error, DesignR.drawable.ic_error, colors.red)
        } else if (ask.answered) {
            StatusLine(
                stringResource(R.string.agent_ask_sent),
                DesignR.drawable.ic_check,
                colors.secondaryLabel
            )
        }
    }
}

/**
 * One of the agent's options: its number in an orange circle, the label over what it
 * means, and a spinner while it goes to the Mac — or a keyboard when it is answered
 * in the tab. Every option dims while another is on its way or has gone through.
 */
@Composable
private fun OptionButton(
    option: AgentDialogOption,
    sending: Boolean,
    busy: Boolean,
    onClick: () -> Unit
) {
    val colors = LpmTheme.colors
    val typography = LpmTheme.typography
    val haptics = LocalHapticFeedback.current
    val target = remember { TouchTarget() }
    val interaction = remember { MutableInteractionSource() }
    val description = stringResource(R.string.agent_ask_option, option.key, option.label)
    Row(
        modifier = Modifier
            .clickableTarget(
                target,
                interaction,
                enabled = !busy,
                role = Role.Button,
                onClick = {
                    haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
                    onClick()
                }
            )
            .clearAndSetSemantics { contentDescription = description }
            .alpha(if (busy && !sending) 0.5f else 1f)
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .background(colors.secondarySystemGroupedBackground, RoundedCornerShape(10.dp))
            .padding(horizontal = 10.dp, vertical = 9.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .alignByBaseline()
                .defaultMinSize(minWidth = 22.dp, minHeight = 22.dp)
                .background(colors.orange.copy(alpha = 0.15f), CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = option.key,
                style = typography.caption1.copy(
                    fontWeight = FontWeight.SemiBold,
                    fontFeatureSettings = "tnum"
                ),
                color = colors.orange
            )
        }
        Column(
            modifier = Modifier
                .alignByBaseline()
                .weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            Text(text = option.label, style = typography.subheadline, color = colors.label)
            if (option.description.isNotEmpty()) {
                Text(
                    text = option.description,
                    style = typography.caption1,
                    color = colors.secondaryLabel
                )
            }
        }
        if (sending) {
            ActivityIndicator(size = ActivityIndicatorSize.Small)
        } else if (option.typed) {
            Icon(
                painter = painterResource(DesignR.drawable.ic_keyboard_alt),
                contentDescription = null,
                tint = colors.secondaryLabel,
                modifier = Modifier.size(18.dp)
            )
        }
    }
}

/** "Sent", or why the pick didn't land, under the options. */
@Composable
private fun StatusLine(text: String, @DrawableRes icon: Int, tint: Color) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            painter = painterResource(icon),
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(16.dp)
        )
        Text(text = text, style = LpmTheme.typography.footnote, color = tint)
    }
}

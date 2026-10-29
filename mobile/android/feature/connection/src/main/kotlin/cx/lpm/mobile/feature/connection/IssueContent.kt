package cx.lpm.mobile.feature.connection

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.data.link.IssueAction
import cx.lpm.mobile.core.data.link.IssueCopy
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ActivityIndicatorSize
import cx.lpm.mobile.core.designsystem.component.CapsuleButton
import cx.lpm.mobile.core.designsystem.theme.LpmTheme

/**
 * Icon, title, one sentence and the issue's buttons. The bar leaves Details to the
 * line under the Mac's name, and puts a single fix beside the words.
 */
@Composable
fun IssueContent(
    state: IssueContentState,
    style: IssueStyle,
    onAction: (IssueAction) -> Unit,
    modifier: Modifier = Modifier,
    hidesDetails: Boolean = false
) {
    val colors = LpmTheme.colors
    val typography = LpmTheme.typography
    val actions = state.copy.actions.filter {
        it != IssueAction.Details || !(hidesDetails || style == IssueStyle.Bar)
    }
    val inline = actions.singleOrNull()?.takeIf { style == IssueStyle.Bar }
    val connecting = state.issue.isConnecting
    val tint = if (state.copy.tone == IssueCopy.Tone.Waiting) colors.orange else colors.red
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = if (inline == null) Alignment.Top else Alignment.CenterVertically
    ) {
        Box(
            Modifier
                .size(29.dp)
                .background(
                    if (connecting) colors.tertiarySystemFill else tint,
                    RoundedCornerShape(7.dp)
                ),
            contentAlignment = Alignment.Center
        ) {
            if (connecting) {
                ActivityIndicator(size = ActivityIndicatorSize.Small)
            } else {
                Icon(
                    painter = painterResource(issueIcon(state.copy.icon)),
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(18.dp)
                )
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(
                text = state.copy.title,
                style = if (style == IssueStyle.Bar) {
                    typography.subheadline.copy(fontWeight = FontWeight.SemiBold)
                } else {
                    typography.headline
                }
            )
            Text(
                text = state.recoveryStatus
                    ?: if (state.wakeSent) {
                        stringResource(R.string.issue_wake_sent)
                    } else if (state.tailscaleWorking) {
                        stringResource(
                            R.string.issue_tailscale_working
                        )
                    } else {
                        state.copy.message
                    },
                style = if (style ==
                    IssueStyle.Bar
                ) {
                    typography.footnote
                } else {
                    typography.subheadline
                },
                color = colors.secondaryLabel
            )
            state.failure?.let { Text(it, style = typography.footnote, color = colors.red) }
            if (state.waitingCount > 0) {
                Text(
                    text = pluralStringResource(
                        R.plurals.issue_waiting,
                        state.waitingCount,
                        state.waitingCount
                    ),
                    style = typography.footnote.copy(fontWeight = FontWeight.Medium),
                    color = colors.orange
                )
            }
            if (actions.isNotEmpty() && inline == null) {
                Row(
                    Modifier.padding(top = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    actions.forEachIndexed { index, action ->
                        IssueActionButton(
                            state,
                            action,
                            index == 0 && action != IssueAction.Details,
                            onAction
                        )
                    }
                }
            }
        }
        if (inline != null) IssueActionButton(state, inline, primary = true, onAction = onAction)
    }
}

@Composable
private fun IssueActionButton(
    state: IssueContentState,
    action: IssueAction,
    primary: Boolean,
    onAction: (IssueAction) -> Unit
) {
    if (primary && action == IssueAction.Retry && state.trying) {
        CapsuleButton(
            text = stringResource(R.string.issue_trying),
            onClick = {},
            prominent = true,
            enabled = false,
            leading = { ActivityIndicator(size = ActivityIndicatorSize.Mini) }
        )
        return
    }
    val turningOn = action == IssueAction.TurnOnTailscale || action == IssueAction.SignInTailscale
    CapsuleButton(
        text = action.label(state.issue),
        onClick = { onAction(action) },
        prominent = primary,
        enabled = !(primary && state.tailscaleWorking && turningOn)
    )
}

package cx.lpm.mobile.feature.terminal

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ContextMenu
import cx.lpm.mobile.core.designsystem.component.LinkButton
import cx.lpm.mobile.core.designsystem.component.PlainIconButton
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.LimitStop
import cx.lpm.mobile.core.ui.tickingNow

/** The desktop's dark `--accent-red` and `--accent-amber`. */
private val Red = Color(0xFFF87171)
private val Amber = Color(0xFFFBBF24)
private val Shape = RoundedCornerShape(14.dp)
private const val CLOCK_TICK_MS = 60_000L

/**
 * Above the composer when a Claude tab stopped at a usage limit (iOS
 * `TerminalLimitStopBar`), as the desktop's bar: which account ran out, when it resets,
 * and the account the conversation can carry on with, moved only on a tap. A hold or
 * one model's limit offers no account. `otherAccounts` lists the Mac's accounts to pick
 * another from.
 */
@Composable
internal fun TerminalLimitStopBar(
    stop: LimitStop,
    canContinue: Boolean,
    onContinue: (LimitStop.Offer) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    otherAccounts: (@Composable ColumnScope.() -> Unit)? = null
) {
    val now = tickingNow(periodMs = CLOCK_TICK_MS)
    if (!stop.holds(now.toDouble())) return
    val tone = if (stop.kind == "model") Amber else Red
    val offer = stop.offer.takeIf { canContinue }
    val reset = stop.reset(now.toDouble())
    Column(
        modifier
            .fillMaxWidth()
            .padding(horizontal = 10.dp, vertical = 8.dp)
            .clip(Shape)
            .background(tone.copy(alpha = 0.06f))
            .border(1.dp, tone.copy(alpha = 0.4f), Shape)
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
            Box(Modifier.padding(top = 6.dp).size(6.dp).background(tone, CircleShape))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(
                    text = buildAnnotatedString {
                        withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) {
                            append(stop.headline)
                        }
                        if (reset.isNotEmpty()) {
                            withStyle(SpanStyle(color = Color.White.copy(alpha = 0.6f))) {
                                append(" · $reset")
                            }
                        }
                    },
                    style = LpmTheme.typography.footnote,
                    color = Color.White
                )
                Text(
                    text = stop.detail(now.toDouble()),
                    style = LpmTheme.typography.caption1,
                    color = Color.White.copy(alpha = 0.55f)
                )
            }
            PlainIconButton(
                icon = painterResource(DesignR.drawable.ic_close),
                contentDescription = stringResource(R.string.terminal_limit_dismiss),
                onClick = onDismiss,
                tint = Color.White.copy(alpha = 0.6f),
                iconSize = 12.dp,
                frame = 24.dp
            )
        }
        if (offer != null) {
            Text(
                text = stringResource(R.string.terminal_limit_continue, offer.label),
                style = LpmTheme.typography.subheadline.copy(fontWeight = FontWeight.SemiBold),
                color = Color.Black,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(Color.White)
                    .clickable { onContinue(offer) }
                    .padding(vertical = 9.dp)
            )
            if (otherAccounts != null) OtherAccounts(otherAccounts)
        }
    }
}

@Composable
private fun OtherAccounts(choices: @Composable ColumnScope.() -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        LinkButton(
            text = stringResource(R.string.terminal_limit_other_account),
            onClick = { open = true },
            color = Color.White.copy(alpha = 0.7f),
            textStyle = LpmTheme.typography.footnote
        )
        ContextMenu(expanded = open, onDismissRequest = { open = false }, content = choices)
    }
}

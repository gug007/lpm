package cx.lpm.mobile.feature.automations.detail

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ActivityIndicatorSize
import cx.lpm.mobile.core.designsystem.component.DisclosureChevron
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.component.StatusDot
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.automations.R as AutomationsR
import cx.lpm.mobile.feature.automations.ui.color

/** One run in the history: how it ended, its answer's first line, and when. */
@Composable
fun RunHistoryRow(run: RunRowUi, onOpen: () -> Unit, modifier: Modifier = Modifier) {
    val colors = LpmTheme.colors
    ListRow(
        modifier = modifier,
        onClick = onOpen,
        verticalPadding = 16.dp,
        trailing = {
            Spacer(Modifier.width(8.dp))
            DisclosureChevron()
        }
    ) {
        Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            StatusDot(color = run.tone.color(), modifier = Modifier.padding(top = 6.dp))
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = run.label,
                        style = LpmTheme.typography.subheadline.copy(
                            fontWeight = if (run.unread) FontWeight.SemiBold else FontWeight.Medium
                        ),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false)
                    )
                    if (run.unread) NewBadge()
                }
                run.preview?.let {
                    Text(
                        text = it,
                        style = LpmTheme.typography.footnote,
                        color = colors.secondaryLabel,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Text(
                    text = run.meta,
                    style = LpmTheme.typography.caption1,
                    color = colors.secondaryLabel,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

/** Marks a run that landed after the automation was last read, until it's opened. */
@Composable
private fun NewBadge() {
    val tint = LpmTheme.colors.tint
    Text(
        text = stringResource(AutomationsR.string.detail_new_badge),
        style = LpmTheme.typography.caption2.copy(fontWeight = FontWeight.SemiBold),
        color = tint,
        modifier = Modifier
            .background(tint.copy(alpha = 0.15f), CircleShape)
            .padding(horizontal = 6.dp, vertical = 2.dp)
    )
}

/**
 * The tail of a run that is still going: the last handful of lines, scrolled sideways
 * rather than wrapped — wrapped log lines read as noise.
 */
@Composable
fun LiveTail(text: String, modifier: Modifier = Modifier) {
    ListRow(modifier = modifier) {
        if (text.isEmpty()) {
            ActivityIndicator(size = ActivityIndicatorSize.Small)
            Spacer(Modifier.width(8.dp))
            Text(
                text = stringResource(AutomationsR.string.detail_waiting_output),
                style = LpmTheme.typography.subheadline,
                color = LpmTheme.colors.secondaryLabel
            )
        } else {
            SelectionContainer(
                Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
            ) {
                Text(
                    text = text.split("\n").takeLast(LIVE_LINES).joinToString("\n"),
                    style = LpmTheme.typography.caption2.copy(fontFamily = FontFamily.Monospace),
                    softWrap = false
                )
            }
        }
    }
}

/** What a live run is doing or where it is, above its output. */
@Composable
fun LivePlace(text: String, modifier: Modifier = Modifier) {
    ListRow(modifier = modifier) {
        Text(
            text = text,
            style = LpmTheme.typography.subheadline,
            color = LpmTheme.colors.secondaryLabel,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )
    }
}

/** Stops a Claude run and carries its conversation on in a terminal on the Mac. */
@Composable
fun TakeOverRow(enabled: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    ListRow(modifier = modifier, onClick = onClick.takeIf { enabled }) {
        Text(
            text = stringResource(AutomationsR.string.detail_take_over),
            style = LpmTheme.typography.subheadline,
            color = if (enabled) LpmTheme.colors.tint else LpmTheme.colors.secondaryLabel
        )
    }
}

private const val LIVE_LINES = 12

package cx.lpm.mobile.feature.usage.usage

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.component.StatusDot
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.LimitReminder
import cx.lpm.mobile.core.model.LimitWindow
import cx.lpm.mobile.core.model.ProviderLimits
import cx.lpm.mobile.core.ui.providerMeta
import cx.lpm.mobile.core.ui.tint
import cx.lpm.mobile.feature.usage.R
import cx.lpm.mobile.feature.usage.ui.groupedCard

/**
 * One tool's usage card: who it is, when it last reported, and its weekly and 5-hour
 * meters. A card whose numbers have gone stale keeps showing them, just dimmed, so the
 * reading is never silently replaced by nothing.
 *
 * [now] is the phone's clock, for the windows the tools stamped; [macNow] the same
 * moment on the Mac's clock, for the `updatedAt` the Mac stamped. [footer] holds the
 * lines a usage row adds; [fiveHourFirst] leads with the 5-hour meter.
 */
@Composable
internal fun UsageProviderCard(
    data: ProviderLimits,
    now: Double,
    macNow: Double,
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    footer: List<String> = emptyList(),
    fill: Color = LpmTheme.colors.secondarySystemGroupedBackground,
    fiveHourFirst: Boolean = false,
    reminder: ((window: String, win: LimitWindow?) -> MeterReminder?)? = null
) {
    val stale = macNow - data.updatedAt > STALE_MS
    Column(
        modifier
            .fillMaxWidth()
            .groupedCard(color = fill)
            .padding(16.dp)
    ) {
        CardHeader(data, title, subtitle, stale, macNow)
        CardDivider()
        Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
            val weekly = @Composable {
                UsageMeter(
                    stringResource(R.string.usage_weekly),
                    data.weekly,
                    WEEKLY_MS,
                    now,
                    stale,
                    reminder = reminder?.invoke(LimitReminder.WEEKLY, data.weekly)
                )
            }
            val fiveHour = @Composable {
                UsageMeter(
                    stringResource(R.string.usage_five_hour),
                    data.fiveHour,
                    FIVE_HOUR_MS,
                    now,
                    stale,
                    reminder = reminder?.invoke(LimitReminder.FIVE_HOUR, data.fiveHour)
                )
            }
            if (fiveHourFirst) {
                fiveHour()
                weekly()
            } else {
                weekly()
                fiveHour()
            }
        }
        if (footer.isNotEmpty()) {
            CardDivider()
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                footer.forEach { line ->
                    Text(
                        line,
                        style = LpmTheme.typography.caption1.copy(fontFeatureSettings = "tnum"),
                        color = LpmTheme.colors.secondaryLabel
                    )
                }
            }
        }
    }
}

@Composable
private fun CardDivider() {
    HorizontalDivider(
        modifier = Modifier.padding(vertical = 12.dp),
        thickness = Dp.Hairline,
        color = LpmTheme.colors.separator
    )
}

/**
 * The name, plan and last report on one row while they fit; the timestamp drops to
 * its own line when they don't, so the card's identity never truncates to "C…".
 */
@Composable
private fun CardHeader(
    data: ProviderLimits,
    title: String,
    subtitle: String?,
    stale: Boolean,
    macNow: Double
) {
    val colors = LpmTheme.colors
    Column(
        Modifier.semantics(mergeDescendants = true) {},
        verticalArrangement = Arrangement.spacedBy(3.dp)
    ) {
        HeaderRow {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                StatusDot(providerMeta(data.provider).tint, Modifier.alpha(if (stale) 0.5f else 1f))
                Text(
                    title,
                    style = LpmTheme.typography.subheadline.copy(fontWeight = FontWeight.SemiBold)
                )
                val label = data.label
                if (!label.isNullOrEmpty()) PlanCapsule(label)
            }
            Text(
                updatedText(data.updatedAt, macNow),
                style = LpmTheme.typography.caption2.copy(fontFeatureSettings = "tnum"),
                color = colors.secondaryLabel,
                modifier = Modifier.alpha(if (stale) 0.6f else 1f)
            )
        }
        if (!subtitle.isNullOrEmpty()) {
            Text(
                subtitle,
                style = LpmTheme.typography.caption1,
                color = colors.secondaryLabel,
                maxLines = 1,
                overflow = TextOverflow.MiddleEllipsis,
                modifier = Modifier.padding(start = 16.dp)
            )
        }
    }
}

@Composable
private fun PlanCapsule(label: String) {
    Text(
        label.uppercase(),
        style = LpmTheme.typography.caption2.copy(fontWeight = FontWeight.Medium),
        color = LpmTheme.colors.secondaryLabel,
        modifier = Modifier
            .background(LpmTheme.colors.tertiarySystemFill, CircleShape)
            .padding(horizontal = 6.dp, vertical = 2.dp)
    )
}

/** Identity and timestamp side by side, 8 dp apart at least; stacked when they don't fit. */
@Composable
private fun HeaderRow(content: @Composable () -> Unit) {
    Layout(content, Modifier.fillMaxWidth()) { measurables, constraints ->
        val loose = constraints.copy(minWidth = 0, minHeight = 0)
        val (identity, updated) = measurables.map { it.measure(loose) }
        val gap = 8.dp.roundToPx()
        val width = constraints.maxWidth
        if (identity.width + gap + updated.width <= width) {
            val height = maxOf(identity.height, updated.height)
            layout(width, height) {
                identity.placeRelative(0, (height - identity.height) / 2)
                updated.placeRelative(width - updated.width, (height - updated.height) / 2)
            }
        } else {
            val spacing = 6.dp.roundToPx()
            layout(width, identity.height + spacing + updated.height) {
                identity.placeRelative(0, 0)
                updated.placeRelative(0, identity.height + spacing)
            }
        }
    }
}

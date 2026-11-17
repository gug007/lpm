package cx.lpm.mobile.feature.usage.stats

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.AgentStats
import cx.lpm.mobile.feature.usage.R
import cx.lpm.mobile.feature.usage.ui.ScalingText
import cx.lpm.mobile.feature.usage.ui.groupedCard

/** The four summary tiles: total (with its cost), input, output and sessions. */
@Composable
internal fun StatsSummaryTiles(stats: AgentStats, days: Int, modifier: Modifier = Modifier) {
    val totals = stats.totals
    val peak = mostActiveDay(stats.daily)
    val cache = cacheShare(totals)
    val reasoning = reasoningShare(totals)
    val cost = estimateTotalCost(stats.models)
    val modelCount = distinctModelCount(stats.recentSessions)
    val projectCount = stats.projects.size
    Column(modifier, verticalArrangement = Arrangement.spacedBy(TileSpacing)) {
        TileRow(
            first = {
                StatTile(
                    label = stringResource(R.string.stats_total_tokens),
                    value = formatTokenCount(totals.totalTokens),
                    aside = if (cost >
                        0
                    ) {
                        stringResource(R.string.stats_cost, formatUsd(cost))
                    } else {
                        null
                    },
                    caption = when {
                        days == 1 -> stringResource(R.string.stats_so_far_today)

                        peak != null -> stringResource(
                            R.string.stats_peak,
                            formatTokenCount(peak.totalTokens),
                            shortUsageDate(peak.date)
                        )

                        else -> null
                    },
                    modifier = it
                )
            },
            second = {
                StatTile(
                    label = stringResource(R.string.stats_input),
                    value = formatTokenCount(totals.inputTokens),
                    caption = if (cache > 0) {
                        stringResource(R.string.stats_from_cache, formatPercent(cache))
                    } else {
                        stringResource(R.string.stats_no_cache)
                    },
                    modifier = it
                ) {
                    if (cache > 0) ShareBar(cache, LpmTheme.colors.secondaryLabel)
                }
            }
        )
        TileRow(
            first = {
                StatTile(
                    label = stringResource(R.string.stats_output),
                    value = formatTokenCount(totals.outputTokens),
                    caption = if (reasoning > 0) {
                        stringResource(R.string.stats_reasoning, formatPercent(reasoning))
                    } else {
                        stringResource(R.string.stats_no_reasoning)
                    },
                    modifier = it
                )
            },
            second = {
                StatTile(
                    label = stringResource(R.string.stats_sessions),
                    value = grouped(stats.sessions.toLong()),
                    caption = stringResource(
                        R.string.stats_projects_models,
                        pluralStringResource(R.plurals.stats_projects, projectCount, projectCount),
                        pluralStringResource(R.plurals.stats_models, modelCount, modelCount)
                    ),
                    modifier = it
                )
            }
        )
    }
}

/** Two tiles side by side, as tall as the taller one. */
@Composable
private fun TileRow(first: @Composable (Modifier) -> Unit, second: @Composable (Modifier) -> Unit) {
    Row(
        Modifier.height(IntrinsicSize.Min),
        horizontalArrangement = Arrangement.spacedBy(TileSpacing)
    ) {
        first(Modifier.weight(1f).fillMaxHeight())
        second(Modifier.weight(1f).fillMaxHeight())
    }
}

@Composable
private fun StatTile(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    aside: String? = null,
    caption: String? = null,
    accessory: @Composable () -> Unit = {}
) {
    val colors = LpmTheme.colors
    val type = LpmTheme.typography
    Column(
        modifier
            .groupedCard(radius = 16.dp)
            .padding(14.dp)
            .heightIn(min = 84.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Text(
            label.uppercase(),
            style = type.caption2.copy(fontWeight = FontWeight.SemiBold),
            color = colors.secondaryLabel,
            maxLines = 1
        )
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            ScalingText(
                value,
                style = type.title2.copy(
                    fontWeight = FontWeight.SemiBold,
                    fontFeatureSettings = "tnum"
                ),
                color = colors.label,
                minScale = 0.7f,
                modifier = Modifier
                    .weight(1f, fill = false)
                    .alignByBaseline()
            )
            if (aside != null) {
                Text(
                    aside,
                    style = type.subheadline.copy(
                        fontWeight = FontWeight.Medium,
                        fontFeatureSettings = "tnum"
                    ),
                    color = colors.secondaryLabel,
                    maxLines = 1,
                    modifier = Modifier.alignByBaseline()
                )
            }
        }
        accessory()
        if (caption != null) {
            ScalingText(caption, type.caption1, colors.secondaryLabel, minScale = 0.8f)
        }
    }
}

/** A thin capsule track filled to [fraction] (0…1). */
@Composable
internal fun ShareBar(
    fraction: Double,
    color: Color,
    modifier: Modifier = Modifier,
    height: Dp = 5.dp
) {
    Box(
        modifier
            .fillMaxWidth()
            .height(height)
            .background(LpmTheme.colors.tertiarySystemFill, CircleShape)
    ) {
        Box(
            Modifier
                .fillMaxWidth(fraction.coerceIn(0.0, 1.0).toFloat())
                .height(height)
                .background(color, CircleShape)
        )
    }
}

private val TileSpacing = 12.dp

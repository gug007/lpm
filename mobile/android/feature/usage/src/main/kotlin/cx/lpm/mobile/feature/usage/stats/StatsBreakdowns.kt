package cx.lpm.mobile.feature.usage.stats

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.data.usage.ALL_MACHINES
import cx.lpm.mobile.core.data.usage.LOCAL_MACHINE
import cx.lpm.mobile.core.designsystem.component.StatusDot
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.UsageBreakdown
import cx.lpm.mobile.core.model.UsageDaily
import cx.lpm.mobile.core.model.UsageMachine
import cx.lpm.mobile.core.model.UsageSession
import cx.lpm.mobile.core.ui.providerMeta
import cx.lpm.mobile.core.ui.tint
import cx.lpm.mobile.feature.usage.R
import cx.lpm.mobile.feature.usage.ui.groupedCard

@Composable
internal fun DailyActivityCard(daily: List<UsageDaily>, modifier: Modifier = Modifier) {
    SectionCard(stringResource(R.string.stats_token_activity), modifier) {
        DailyActivityChart(daily)
    }
}

@Composable
internal fun ProviderBreakdownCard(
    providers: List<UsageBreakdown>,
    total: Long,
    modifier: Modifier = Modifier
) {
    SectionCard(stringResource(R.string.stats_providers), modifier) {
        if (providers.isEmpty()) {
            EmptyRow(stringResource(R.string.stats_no_providers))
            return@SectionCard
        }
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            providers.sortedByDescending { it.tokens.totalTokens }.forEach { provider ->
                val meta = providerMeta(provider.key)
                val share = provider.tokens.totalTokens.toDouble() / maxOf(1L, total)
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        StatusDot(meta.tint, size = 9.dp)
                        Spacer(Modifier.width(8.dp))
                        Text(meta.label, style = medium, modifier = Modifier.weight(1f))
                        Text(formatTokenCount(provider.tokens.totalTokens), style = figure)
                    }
                    ShareBar(share, meta.tint)
                    Caption(
                        stringResource(
                            R.string.stats_sessions_share,
                            sessions(provider.sessions),
                            formatPercent(share)
                        )
                    )
                }
            }
        }
    }
}

@Composable
internal fun TopProjectsCard(
    projects: List<UsageBreakdown>,
    days: Int,
    modifier: Modifier = Modifier
) {
    SectionCard(stringResource(R.string.stats_top_projects), modifier) {
        if (projects.isEmpty()) {
            EmptyRow(stringResource(R.string.stats_nothing_in, usagePeriodLabel(days)))
            return@SectionCard
        }
        val maxTokens = maxOf(1L, projects.maxOf { it.tokens.totalTokens })
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            projects.sortedByDescending {
                it.tokens.totalTokens
            }.take(PROJECTS_CAP).forEach { project ->
                Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            project.label,
                            style = medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f)
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(formatTokenCount(project.tokens.totalTokens), style = figure)
                    }
                    ShareBar(
                        project.tokens.totalTokens.toDouble() / maxTokens,
                        LpmTheme.colors.secondaryLabel
                    )
                    Caption(sessions(project.sessions))
                }
            }
            if (projects.size > PROJECTS_CAP) {
                val more = projects.size - PROJECTS_CAP
                Caption(pluralStringResource(R.plurals.stats_more, more, more))
            }
        }
    }
}

@Composable
internal fun RecentSessionsCard(
    sessions: List<UsageSession>,
    days: Int,
    now: Long,
    modifier: Modifier = Modifier,
    machineNames: Map<String, String> = emptyMap()
) {
    SectionCard(stringResource(R.string.stats_recent_sessions), modifier) {
        if (sessions.isEmpty()) {
            EmptyRow(stringResource(R.string.stats_nothing_in, usagePeriodLabel(days)))
            return@SectionCard
        }
        Column {
            sessions.take(SESSIONS_CAP).forEachIndexed { index, session ->
                if (index >
                    0
                ) {
                    HorizontalDivider(
                        thickness = Dp.Hairline,
                        color = LpmTheme.colors.separator
                    )
                }
                SessionRow(
                    session,
                    now,
                    session.machine?.let(machineNames::get),
                    Modifier.padding(vertical = 8.dp)
                )
            }
        }
    }
}

@Composable
private fun SessionRow(
    session: UsageSession,
    now: Long,
    machineName: String?,
    modifier: Modifier = Modifier
) {
    val meta = providerMeta(session.provider)
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        StatusDot(meta.tint, size = 9.dp)
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(session.project, style = medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val ago = relativeUsageTime(session.lastAt, now)
            Caption(
                if (machineName != null) {
                    stringResource(
                        R.string.stats_session_meta_machine,
                        shortModelName(session.model),
                        machineName,
                        ago
                    )
                } else {
                    stringResource(R.string.stats_session_meta, shortModelName(session.model), ago)
                },
                maxLines = 1
            )
        }
        Spacer(Modifier.width(8.dp))
        Text(formatTokenCount(session.tokens.totalTokens), style = figure)
    }
}

/** The privacy note and how many history files were read, and where. */
@Composable
internal fun StatsFooter(
    totalFiles: Int,
    machine: String,
    machines: List<UsageMachine>,
    modifier: Modifier = Modifier
) {
    val style = LpmTheme.typography.caption2
    val color = LpmTheme.colors.secondaryLabel
    val several = machines.size > 1 && machine != LOCAL_MACHINE
    val files = grouped(totalFiles.toLong())
    val where = when (machine) {
        ALL_MACHINES -> machinesCount(machines, machines.count { it.isCounted })
        else -> machines.firstOrNull { it.id == machine }?.name
    }
    Column(
        modifier
            .fillMaxWidth()
            .padding(top = 4.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text(
            stringResource(
                when {
                    !several -> R.string.stats_privacy
                    allMacs(machines) -> R.string.stats_privacy_macs
                    else -> R.string.stats_privacy_computers
                }
            ),
            style = style,
            color = color
        )
        Text(
            if (several && where != null) {
                stringResource(R.string.stats_files_scanned_on, files, where)
            } else {
                stringResource(R.string.stats_files_scanned, files)
            },
            style = style,
            color = color
        )
    }
}

/** A titled card on the Stats screen. */
@Composable
internal fun SectionCard(
    title: String,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    Column(
        modifier
            .fillMaxWidth()
            .groupedCard()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(
            title,
            style = LpmTheme.typography.subheadline.copy(fontWeight = FontWeight.SemiBold)
        )
        content()
    }
}

@Composable
private fun EmptyRow(text: String) {
    Caption(text, Modifier.padding(vertical = 4.dp))
}

@Composable
private fun Caption(text: String, modifier: Modifier = Modifier, maxLines: Int = Int.MAX_VALUE) {
    Text(
        text,
        style = LpmTheme.typography.caption1.copy(fontFeatureSettings = "tnum"),
        color = LpmTheme.colors.secondaryLabel,
        maxLines = maxLines,
        overflow = TextOverflow.Ellipsis,
        modifier = modifier
    )
}

@Composable
private fun sessions(count: Int): String =
    pluralStringResource(R.plurals.stats_session_count, count, count)

private val medium
    @Composable get() = LpmTheme.typography.subheadline.copy(fontWeight = FontWeight.Medium)

private val figure
    @Composable get() = LpmTheme.typography.subheadline.copy(
        fontWeight = FontWeight.SemiBold,
        fontFeatureSettings = "tnum"
    )

private const val PROJECTS_CAP = 8
private const val SESSIONS_CAP = 10

package cx.lpm.mobile.feature.automations.detail

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.LinkButton
import cx.lpm.mobile.core.designsystem.component.ListHeaderStyle
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.component.ListSection
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.AutomationJob
import cx.lpm.mobile.core.model.hasOnOffSwitch
import cx.lpm.mobile.feature.automations.R as AutomationsR

/**
 * The name is already in the bar, so the header spends its row on what the bar can't
 * say: where the job runs and what it's doing right now.
 */
@Composable
fun DetailHeader(state: AutomationDetailUiState, modifier: Modifier = Modifier) {
    val job = state.job ?: return
    ListSection(modifier = modifier) {
        ListRow(verticalPadding = 14.dp) {
            Text(text = job.emoji.ifEmpty { "⏱️" }, style = LpmTheme.typography.title3)
            Spacer(Modifier.width(10.dp))
            Text(
                text = state.scope,
                style = LpmTheme.typography.subheadline,
                color = LpmTheme.colors.secondaryLabel,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f)
            )
            Spacer(Modifier.width(8.dp))
            AutomationStatusPill(job = job, text = state.pill, tone = state.pillTone)
        }
        if (!job.valid) InvalidRow(job)
    }
}

@Composable
private fun InvalidRow(job: AutomationJob) {
    val red = LpmTheme.colors.red
    ListRow(
        leading = {
            Icon(
                painter = painterResource(R.drawable.ic_warning_fill),
                contentDescription = null,
                tint = red,
                modifier = Modifier.size(20.dp)
            )
        }
    ) {
        Text(
            text = job.error.ifEmpty { stringResource(AutomationsR.string.detail_cant_run) },
            style = LpmTheme.typography.subheadline,
            color = red
        )
    }
}

/** "Schedule": the switch, when it runs next, and how the last run went. */
@Composable
fun ScheduleGroup(
    state: AutomationDetailUiState,
    actions: AutomationDetailActions,
    modifier: Modifier = Modifier
) {
    val job = state.job ?: return
    DisclosureRow(
        modifier = modifier,
        title = stringResource(AutomationsR.string.detail_schedule),
        value = state.schedule,
        expanded = state.scheduleOpen,
        onToggle = actions.toggleSchedule
    )
    if (!state.scheduleOpen) return
    if (job.hasOnOffSwitch) {
        GroupToggleRow(
            title = stringResource(AutomationsR.string.detail_enabled),
            checked = job.enabled,
            onCheckedChange = actions.setEnabled,
            enabled = job.valid && !state.pending
        )
    }
    state.nextRun?.let { GroupValueRow(stringResource(AutomationsR.string.detail_next_run), it) }
    state.lastRun?.let { TimeRow(stringResource(AutomationsR.string.detail_last_run), it) }
}

/** "Does": the prompt or command in full, the agent, and where it works. */
@Composable
fun SetupGroup(
    state: AutomationDetailUiState,
    actions: AutomationDetailActions,
    modifier: Modifier = Modifier
) {
    val setup = state.setup ?: return
    // Open, the full prompt sits right below — the stand-in would only repeat it.
    DisclosureRow(
        modifier = modifier,
        title = stringResource(AutomationsR.string.detail_does),
        value = if (state.setupOpen) "" else setup.firstLine,
        expanded = state.setupOpen,
        onToggle = actions.toggleSetup
    )
    if (!state.setupOpen) return
    if (setup.summary.isNotEmpty()) {
        ListRow(indent = GroupIndent) {
            SelectionContainer {
                Text(
                    text = setup.summary,
                    style = if (setup.monospace) {
                        LpmTheme.typography.subheadline.copy(fontFamily = FontFamily.Monospace)
                    } else {
                        LpmTheme.typography.subheadline
                    }
                )
            }
        }
    }
    setup.agent?.let { GroupValueRow(stringResource(AutomationsR.string.detail_agent), it) }
    if (setup.duplicate) {
        ListRow(
            indent = GroupIndent,
            leading = {
                Icon(
                    painter = painterResource(R.drawable.ic_content_copy),
                    contentDescription = null,
                    tint = LpmTheme.colors.tint,
                    modifier = Modifier.size(20.dp)
                )
            }
        ) {
            Text(
                text = stringResource(AutomationsR.string.detail_fresh_copy),
                style = LpmTheme.typography.subheadline
            )
        }
    }
    setup.runsIn?.let { GroupValueRow(stringResource(AutomationsR.string.detail_runs_in), it) }
    setup.runsOn?.let { GroupValueRow(stringResource(AutomationsR.string.detail_runs_on), it) }
}

/** Every run, newest first; the first few until asked for the rest. */
@Composable
fun RunHistorySection(
    state: AutomationDetailUiState,
    actions: AutomationDetailActions,
    modifier: Modifier = Modifier
) {
    var showAll by rememberSaveable { mutableStateOf(false) }
    val runs = state.runs
    val shown = if (showAll) runs else runs.take(HISTORY_PREVIEW)
    ListSection(
        modifier = modifier,
        header = stringResource(AutomationsR.string.detail_history),
        headerStyle = ListHeaderStyle.Title,
        headerAction = { HistoryHeaderTrailing(state, actions.markRead) }
    ) {
        when {
            state.historyLoading -> ListRow {
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    ActivityIndicator()
                }
            }

            runs.isEmpty() -> ListRow {
                Text(
                    text = stringResource(AutomationsR.string.detail_no_runs),
                    style = LpmTheme.typography.subheadline,
                    color = LpmTheme.colors.secondaryLabel
                )
            }

            else -> {
                shown.forEach { run ->
                    key(run.rootAt) { RunHistoryRow(run, onOpen = { actions.openRun(run.rootAt) }) }
                }
                if (runs.size > shown.size) {
                    ListRow(onClick = { showAll = true }) {
                        Text(
                            text = pluralStringResource(
                                AutomationsR.plurals.detail_show_all,
                                runs.size,
                                runs.size
                            ),
                            style = LpmTheme.typography.subheadline,
                            color = LpmTheme.colors.tint
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun HistoryHeaderTrailing(state: AutomationDetailUiState, onMarkRead: () -> Unit) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if ((state.job?.unread ?: 0) > 0) {
            LinkButton(
                text = stringResource(AutomationsR.string.detail_mark_read),
                onClick = onMarkRead,
                textStyle = LpmTheme.typography.caption1
            )
        }
        if (state.runs.isNotEmpty()) {
            Text(
                text = "%,d".format(state.runs.size),
                style = LpmTheme.typography.headline,
                color = LpmTheme.colors.secondaryLabel
            )
        }
    }
}

/** How many runs the history shows before it asks to be expanded. */
private const val HISTORY_PREVIEW = 8

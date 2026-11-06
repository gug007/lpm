package cx.lpm.mobile.feature.automations.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R
import cx.lpm.mobile.core.designsystem.component.EmptyState
import cx.lpm.mobile.core.designsystem.component.GlassIconButton
import cx.lpm.mobile.core.designsystem.component.ListCard
import cx.lpm.mobile.core.designsystem.component.ListDefaults
import cx.lpm.mobile.core.designsystem.component.ListHeaderStyle
import cx.lpm.mobile.core.designsystem.component.ListSection
import cx.lpm.mobile.core.designsystem.component.LpmTopBar
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.automations.R as AutomationsR
import cx.lpm.mobile.feature.automations.ui.AutomationAskCard
import cx.lpm.mobile.feature.automations.ui.HeaderlessTopPadding
import kotlinx.serialization.json.JsonObject

/** What the automation page's controls do. */
@Immutable
class AutomationDetailActions(
    val back: () -> Unit = {},
    val edit: () -> Unit = {},
    val setEnabled: (Boolean) -> Unit = {},
    val toggleSchedule: () -> Unit = {},
    val toggleSetup: () -> Unit = {},
    val markRead: () -> Unit = {},
    val openRun: (Long) -> Unit = {},
    val runBar: () -> Unit = {},
    val takeOver: () -> Unit = {},
    val answer: (askId: String, answers: JsonObject) -> Unit = { _, _ -> },
    val dismissQuestion: (askId: String) -> Unit = {}
)

/**
 * One automation's page (iOS `AutomationDetailView`): where it runs and what it's
 * doing now, its schedule and setup folded away, the live output while it runs,
 * every run it has made, and the run bar pinned at the bottom.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AutomationDetailScreen(
    state: AutomationDetailUiState,
    refreshing: Boolean,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    actions: AutomationDetailActions = AutomationDetailActions()
) {
    val job = state.job
    Column(
        modifier
            .fillMaxSize()
            .background(LpmTheme.colors.systemGroupedBackground)
    ) {
        LpmTopBar(
            title = job?.displayName ?: stringResource(AutomationsR.string.detail_title),
            leading = {
                GlassIconButton(
                    icon = painterResource(R.drawable.ic_arrow_back_ios_new),
                    contentDescription = stringResource(AutomationsR.string.back),
                    onClick = actions.back
                )
            },
            trailing = {
                if (job != null) {
                    GlassIconButton(
                        icon = painterResource(R.drawable.ic_edit),
                        contentDescription = stringResource(AutomationsR.string.detail_edit),
                        onClick = actions.edit
                    )
                }
            }
        )
        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = onRefresh,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
        ) {
            Column(
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(top = HeaderlessTopPadding, bottom = 16.dp)
            ) {
                if (job != null) {
                    DetailHeader(state)
                    // The question the automation is waiting on, wherever it waits.
                    job.ask?.let { ask ->
                        ListSection {
                            AutomationAskCard(
                                ask = ask,
                                whenText = state.askWhen,
                                busy = state.answering,
                                error = state.askError,
                                onAnswer = { actions.answer(ask.id, it) },
                                onDismiss = { actions.dismissQuestion(ask.id) },
                                framed = false,
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                            )
                        }
                    }
                    ListSection {
                        ScheduleGroup(state, actions)
                        SetupGroup(state, actions)
                    }
                    state.live?.let { live ->
                        ListSection(
                            header = stringResource(AutomationsR.string.detail_live_output),
                            headerStyle = ListHeaderStyle.Title
                        ) {
                            if (state.livePlace.isNotEmpty()) LivePlace(state.livePlace)
                            LiveTail(live)
                            if (job?.takeOverIn?.isNotEmpty() == true) {
                                TakeOverRow(enabled = !state.pending, onClick = actions.takeOver)
                            }
                        }
                    }
                } else if (state.loaded) {
                    NotFound()
                }
                RunHistorySection(state, actions)
            }
        }
        if (job != null) {
            AutomationRunBar(job = job, pending = state.pending, onClick = actions.runBar)
        }
    }
}

@Composable
private fun NotFound() {
    ListCard(Modifier.padding(horizontal = ListDefaults.Margin, vertical = 8.dp)) {
        EmptyState(
            title = stringResource(AutomationsR.string.detail_not_found),
            icon = painterResource(R.drawable.ic_history_toggle_off),
            description = {
                Text(
                    text = stringResource(AutomationsR.string.detail_not_found_hint),
                    style = LpmTheme.typography.body,
                    color = LpmTheme.colors.secondaryLabel,
                    textAlign = TextAlign.Center
                )
            },
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 32.dp)
        )
    }
}

package cx.lpm.mobile.feature.automations.list

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.EmptyState
import cx.lpm.mobile.core.designsystem.component.GlassCapsuleButton
import cx.lpm.mobile.core.designsystem.component.GlassIconButton
import cx.lpm.mobile.core.designsystem.component.LinkButton
import cx.lpm.mobile.core.designsystem.component.ListDefaults
import cx.lpm.mobile.core.designsystem.component.ListHeaderStyle
import cx.lpm.mobile.core.designsystem.component.ListSection
import cx.lpm.mobile.core.designsystem.component.LpmTopBar
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.AutomationJob
import cx.lpm.mobile.feature.automations.R as AutomationsR

/** What the list's rows and bar do. */
@Immutable
class AutomationsActions(
    val back: () -> Unit = {},
    val open: (AutomationJob) -> Unit = {},
    val create: () -> Unit = {},
    val edit: (AutomationJob) -> Unit = {},
    val markAllRead: () -> Unit = {},
    val markRead: (AutomationJob) -> Unit = {},
    val toggleFailedOnly: () -> Unit = {},
    val toggleEnabled: (AutomationJob) -> Unit = {},
    val run: (AutomationJob) -> Unit = {},
    val stop: (AutomationJob) -> Unit = {}
)

/**
 * The automations feed (iOS `AutomationsView`): what's unread under "New", the rest
 * under "Earlier", "Mark all read" while anything is unread, "Failed" to keep only the
 * jobs whose last run failed while any did, and "+" for a new job.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AutomationsScreen(
    state: AutomationsUiState,
    refreshing: Boolean,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    actions: AutomationsActions = AutomationsActions()
) {
    Column(
        modifier
            .fillMaxSize()
            .background(LpmTheme.colors.systemGroupedBackground)
    ) {
        LpmTopBar(
            title = stringResource(AutomationsR.string.automations_title),
            leading = {
                GlassIconButton(
                    icon = painterResource(R.drawable.ic_arrow_back_ios_new),
                    contentDescription = stringResource(AutomationsR.string.back),
                    onClick = actions.back
                )
                if (state.anyUnread) {
                    GlassCapsuleButton(
                        text = stringResource(AutomationsR.string.automations_mark_all_read),
                        onClick = actions.markAllRead,
                        textStyle = LpmTheme.typography.subheadline
                    )
                }
            },
            trailing = {
                if (state.failedCount > 0) {
                    AutomationFailedToggle(
                        count = state.failedCount,
                        isOn = state.failedOnly,
                        onToggle = actions.toggleFailedOnly
                    )
                }
                GlassIconButton(
                    icon = painterResource(R.drawable.ic_add),
                    contentDescription = stringResource(AutomationsR.string.automations_add),
                    onClick = actions.create,
                    iconSize = 30.dp
                )
            }
        )
        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = onRefresh,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
        ) {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(
                    top = ListDefaults.ContentTopPadding,
                    bottom = 24.dp
                )
            ) {
                rowsSection(
                    id = "new",
                    header = AutomationsR.string.automations_new_section,
                    rows = state.unread,
                    actions = actions
                )
                rowsSection(
                    id = "earlier",
                    header = if (state.unread.isNotEmpty() && state.read.isNotEmpty()) {
                        AutomationsR.string.automations_earlier_section
                    } else {
                        null
                    },
                    rows = state.read,
                    actions = actions
                )
            }
            AutomationsOverlay(state, actions.create)
        }
    }
}

private fun LazyListScope.rowsSection(
    id: String,
    header: Int?,
    rows: List<AutomationRowUi>,
    actions: AutomationsActions
) {
    if (rows.isEmpty()) return
    item(key = id) {
        ListSection(
            header = header?.let { stringResource(it) },
            headerStyle = ListHeaderStyle.Title
        ) {
            rows.forEach { row ->
                key(row.job.key) { AutomationRow(row, actions) }
            }
        }
    }
}

/** "Loading automations…" until the first list, then the empty state if there's none. */
@Composable
private fun AutomationsOverlay(state: AutomationsUiState, onCreate: () -> Unit) {
    when {
        !state.loaded -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                ActivityIndicator()
                Spacer(Modifier.height(8.dp))
                Text(
                    text = stringResource(AutomationsR.string.automations_loading),
                    style = LpmTheme.typography.body,
                    color = LpmTheme.colors.secondaryLabel
                )
            }
        }

        state.isEmpty -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            EmptyState(
                title = stringResource(AutomationsR.string.automations_empty),
                icon = painterResource(R.drawable.ic_history),
                description = {
                    Text(
                        text = stringResource(
                            if (state.project == null) {
                                AutomationsR.string.automations_empty_all
                            } else {
                                AutomationsR.string.automations_empty_project
                            }
                        ),
                        style = LpmTheme.typography.body,
                        color = LpmTheme.colors.secondaryLabel,
                        textAlign = TextAlign.Center
                    )
                },
                actions = {
                    LinkButton(
                        text = stringResource(AutomationsR.string.automations_add),
                        onClick = onCreate,
                        textStyle = LpmTheme.typography.body,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }
            )
        }
    }
}

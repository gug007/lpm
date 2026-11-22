package cx.lpm.mobile.feature.projects.resume

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.CapsuleButton
import cx.lpm.mobile.core.designsystem.component.EmptyState
import cx.lpm.mobile.core.designsystem.component.LinkButton
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.component.ListSection
import cx.lpm.mobile.core.designsystem.component.ListSectionSpacing
import cx.lpm.mobile.core.designsystem.component.LpmTopBar
import cx.lpm.mobile.core.designsystem.component.SearchField
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.AgentSession
import cx.lpm.mobile.feature.projects.R

/** What the Resume Session list's controls do. */
@Immutable
class ResumeSessionActions(
    val search: (String) -> Unit = {},
    val filter: (String?) -> Unit = {},
    val open: (AgentSession) -> Unit = {},
    val older: () -> Unit = {},
    val retry: () -> Unit = {}
)

/**
 * The Resume Session page (iOS `ResumeSessionList`): its bar with [leading] (Cancel,
 * or Back inside New Tab), the search, the agent filter, then the sessions by day.
 */
@Composable
fun ResumeSessionList(
    state: ResumeSessionUiState,
    modifier: Modifier = Modifier,
    actions: ResumeSessionActions = ResumeSessionActions(),
    leading: @Composable RowScope.() -> Unit = {}
) {
    Column(modifier.fillMaxSize()) {
        LpmTopBar(
            title = stringResource(R.string.resume_title),
            modifier = Modifier.padding(top = 16.dp),
            windowInsets = WindowInsets(0),
            leading = leading
        )
        SearchField(
            query = state.query,
            onQueryChange = actions.search,
            placeholder = stringResource(R.string.resume_search),
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 8.dp)
        )
        SessionProviderFilter(
            providers = state.providers,
            selection = state.filter,
            onSelect = actions.filter,
            modifier = Modifier.padding(top = 8.dp, bottom = 10.dp)
        )
        Box(
            Modifier
                .weight(1f)
                .fillMaxWidth()
        ) {
            if (state.showsPlaceholder) Placeholder(state, actions) else Sessions(state, actions)
        }
    }
}

@Composable
private fun Sessions(state: ResumeSessionUiState, actions: ResumeSessionActions) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
        state.groups.forEach { group ->
            item(key = "group:${group.id}") {
                ListSection(header = dayLabel(group.day), spacing = ListSectionSpacing.Compact) {
                    group.rows.forEach { row ->
                        key(row.session.key) {
                            ResumeSessionRow(row, onOpen = { actions.open(row.session) })
                        }
                    }
                }
            }
        }
        if (state.list.hasMore || state.list.error != null) {
            item(key = "older") {
                ListSection(spacing = ListSectionSpacing.Compact) { OlderRow(state, actions) }
            }
        }
    }
}

/** The row past the last session: older ones on their way, why they didn't come, or the ask. */
@Composable
private fun OlderRow(state: ResumeSessionUiState, actions: ResumeSessionActions) {
    val error = state.list.error
    when {
        state.list.loading -> ListRow {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                ActivityIndicator()
            }
        }

        error != null -> ListRow {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = error,
                    style = LpmTheme.typography.footnote,
                    color = LpmTheme.colors.secondaryLabel
                )
                LinkButton(
                    text = stringResource(R.string.resume_try_again),
                    onClick = actions.retry,
                    textStyle = LpmTheme.typography.body
                )
            }
        }

        else -> ListRow(onClick = actions.older, modifier = Modifier.heightIn(min = 44.dp)) {
            Text(
                text = stringResource(R.string.resume_show_older),
                style = LpmTheme.typography.body,
                color = LpmTheme.colors.tint
            )
        }
    }
}

/** Loading, a failure, no match for the search, or no sessions at all. */
@Composable
private fun Placeholder(state: ResumeSessionUiState, actions: ResumeSessionActions) {
    val error = state.list.error
    when {
        state.list.loading || !state.list.loaded -> ListSection(
            spacing = ListSectionSpacing.Compact
        ) {
            SkeletonWidths.forEach { TwoLineRowSkeleton(it.dp, (it + 70).dp) }
        }

        error != null -> Unavailable(
            title = stringResource(R.string.resume_failed),
            icon = painterResource(DesignR.drawable.ic_warning),
            description = error,
            action = stringResource(R.string.resume_try_again),
            onAction = actions.retry
        )

        state.search.isNotEmpty() -> Unavailable(
            title = stringResource(R.string.resume_no_results, state.search),
            icon = painterResource(DesignR.drawable.ic_search),
            description = stringResource(R.string.resume_no_results_message)
        )

        else -> Unavailable(
            title = stringResource(R.string.resume_empty),
            icon = painterResource(DesignR.drawable.ic_history),
            description = stringResource(R.string.resume_empty_message)
        )
    }
}

@Composable
private fun Unavailable(
    title: String,
    icon: Painter,
    description: String,
    action: String? = null,
    onAction: () -> Unit = {}
) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        EmptyState(
            title = title,
            icon = icon,
            description = {
                Text(
                    text = description,
                    style = LpmTheme.typography.body,
                    color = LpmTheme.colors.secondaryLabel,
                    textAlign = TextAlign.Center
                )
            },
            actions = action?.let {
                {
                    CapsuleButton(
                        text = it,
                        onClick = onAction,
                        prominent = true,
                        textStyle = LpmTheme.typography.headline
                    )
                }
            }
        )
    }
}

@Composable
private fun dayLabel(day: SessionDay): String = when (day) {
    SessionDay.Today -> stringResource(R.string.resume_today)
    SessionDay.Yesterday -> stringResource(R.string.resume_yesterday)
    SessionDay.EarlierThisWeek -> stringResource(R.string.resume_this_week)
    SessionDay.EarlierThisMonth -> stringResource(R.string.resume_this_month)
    is SessionDay.Month -> day.label()
    SessionDay.Older -> stringResource(R.string.resume_older)
}

private val SkeletonWidths = listOf(180, 140, 200, 120, 160)

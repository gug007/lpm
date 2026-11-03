package cx.lpm.mobile.feature.memory.list

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.EmptyState
import cx.lpm.mobile.core.designsystem.component.GlassIconButton
import cx.lpm.mobile.core.designsystem.component.LpmTopBar
import cx.lpm.mobile.core.designsystem.component.PlainListDefaults
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.memory.R

/** What the list's rows and bar do. */
@Immutable
class MemoryActions(
    val back: () -> Unit = {},
    val create: () -> Unit = {},
    val open: (MemoryRowUi) -> Unit = {},
    val delete: (MemoryRowUi) -> Unit = {},
    val retry: () -> Unit = {}
)

/**
 * Session memory for one project (iOS `MemoryScreen`): the work logs agents write when
 * they hand off, newest first, with a "Shared with" line when a copy reads its
 * original's sessions.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MemoryScreen(
    state: MemoryUiState,
    refreshing: Boolean,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    actions: MemoryActions = MemoryActions()
) {
    val colors = LpmTheme.colors
    Column(
        modifier
            .fillMaxSize()
            .background(colors.systemBackground)
    ) {
        LpmTopBar(
            title = stringResource(R.string.memory_title),
            leading = {
                GlassIconButton(
                    icon = painterResource(DesignR.drawable.ic_arrow_back_ios_new),
                    contentDescription = stringResource(R.string.back),
                    onClick = actions.back
                )
            },
            trailing = {
                GlassIconButton(
                    icon = painterResource(DesignR.drawable.ic_add),
                    contentDescription = stringResource(R.string.memory_new_session),
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
                contentPadding = PaddingValues(top = PlainListDefaults.TopInset, bottom = 24.dp)
            ) {
                if (state.shared) {
                    item(key = "shared") { SharedWith(state.ownerLabel) }
                }
                itemsIndexed(state.rows, key = { _, it -> it.name }) { i, row ->
                    MemorySessionRow(
                        row = row,
                        // The "Shared with" line hides its separators, the one above this too.
                        first = i == 0 && !state.shared,
                        onOpen = { actions.open(row) },
                        onDelete = { actions.delete(row) }
                    )
                }
            }
            if (state.rows.isEmpty()) MemoryOverlay(state, actions)
        }
    }
}

@Composable
private fun SharedWith(owner: String, modifier: Modifier = Modifier) {
    val colors = LpmTheme.colors
    Row(
        modifier
            .fillMaxWidth()
            .padding(
                horizontal = PlainListDefaults.RowPadding,
                vertical = PlainListDefaults.RowInset
            ),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            painter = painterResource(DesignR.drawable.ic_call_split),
            contentDescription = null,
            tint = colors.secondaryLabel,
            modifier = Modifier.size(16.dp)
        )
        Text(
            text = stringResource(R.string.memory_shared_with, owner),
            style = LpmTheme.typography.caption1,
            color = colors.secondaryLabel
        )
    }
}

/** The spinner, the failure with "Try Again", or the empty state with "New Session". */
@Composable
private fun MemoryOverlay(state: MemoryUiState, actions: MemoryActions) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        when {
            state.loading -> ActivityIndicator()

            state.error != null -> EmptyState(
                title = stringResource(R.string.memory_load_failed),
                icon = painterResource(DesignR.drawable.ic_warning),
                description = state.error,
                action = stringResource(R.string.try_again),
                onAction = actions.retry
            )

            else -> EmptyState(
                title = stringResource(R.string.memory_empty),
                icon = painterResource(DesignR.drawable.ic_psychology),
                description = stringResource(R.string.memory_empty_description),
                action = stringResource(R.string.memory_empty_action),
                onAction = actions.create
            )
        }
    }
}

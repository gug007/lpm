package cx.lpm.mobile.feature.memory.session

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.EmptyState
import cx.lpm.mobile.core.designsystem.component.GlassButtonGroup
import cx.lpm.mobile.core.designsystem.component.GlassGroupButton
import cx.lpm.mobile.core.designsystem.component.GlassIconButton
import cx.lpm.mobile.core.designsystem.component.LpmTopBar
import cx.lpm.mobile.core.designsystem.component.MarkdownText
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.memory.R
import cx.lpm.mobile.feature.memory.ui.GlassGroupTextButton

/** What the session page's bar and overlay do. */
@Immutable
class MemorySessionActions(
    val back: () -> Unit = {},
    val edit: () -> Unit = {},
    val delete: () -> Unit = {},
    val retry: () -> Unit = {},
    val dismissConflict: () -> Unit = {}
)

/**
 * One session memory document, rendered (iOS `MemorySessionView`): who wrote it last
 * and when, its name, then the markdown. [editing] hides the conflict notice, which
 * the open editor shows instead.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MemorySessionScreen(
    state: MemorySessionUiState,
    refreshing: Boolean,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    editing: Boolean = false,
    windowInsets: WindowInsets = WindowInsets.statusBars,
    actions: MemorySessionActions = MemorySessionActions()
) {
    val colors = LpmTheme.colors
    Column(
        modifier
            .fillMaxSize()
            .background(colors.systemBackground)
    ) {
        LpmTopBar(
            title = state.title,
            windowInsets = windowInsets,
            leading = {
                GlassIconButton(
                    icon = painterResource(DesignR.drawable.ic_arrow_back_ios_new),
                    contentDescription = stringResource(R.string.back),
                    onClick = actions.back
                )
            },
            trailing = {
                GlassButtonGroup {
                    GlassGroupTextButton(
                        text = stringResource(R.string.memory_session_edit),
                        onClick = actions.edit,
                        enabled = state.canEdit
                    )
                    GlassGroupButton(
                        icon = painterResource(DesignR.drawable.ic_delete),
                        contentDescription = stringResource(R.string.memory_session_delete),
                        onClick = actions.delete,
                        enabled = !state.deleting
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
                    // 14 pt, under an iOS 26 bar that runs 10 pt below its buttons.
                    .padding(start = 18.dp, top = 24.dp, end = 18.dp, bottom = 14.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                val notice = state.conflictNotice
                if (!editing && notice != null) ConflictBanner(notice, actions.dismissConflict)
                state.content?.let { content ->
                    Stamp(state)
                    MarkdownText(content)
                }
            }
            if (state.content == null) SessionOverlay(state, actions.retry)
        }
    }
}

@Composable
private fun Stamp(state: MemorySessionUiState, modifier: Modifier = Modifier) {
    val colors = LpmTheme.colors
    val type = LpmTheme.typography
    Column(modifier, verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(
            text = if (state.agent.isEmpty()) {
                stringResource(R.string.memory_session_updated, state.updated)
            } else {
                stringResource(R.string.memory_session_updated_by, state.updated, state.agent)
            },
            style = type.caption1,
            color = colors.secondaryLabel
        )
        Text(
            text = state.name,
            style = type.caption2.copy(fontFamily = FontFamily.Monospace),
            color = colors.secondaryLabel
        )
    }
}

@Composable
private fun SessionOverlay(state: MemorySessionUiState, onRetry: () -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        val error = state.error
        when {
            state.loading -> ActivityIndicator()

            error != null -> EmptyState(
                title = stringResource(R.string.memory_session_open_failed),
                icon = painterResource(DesignR.drawable.ic_unknown_document),
                description = error,
                action = stringResource(R.string.try_again),
                onAction = onRetry
            )
        }
    }
}

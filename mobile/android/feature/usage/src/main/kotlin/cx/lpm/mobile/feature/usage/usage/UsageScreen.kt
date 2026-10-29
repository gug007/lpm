package cx.lpm.mobile.feature.usage.usage

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.LimitReminder
import cx.lpm.mobile.core.model.LimitWindow
import cx.lpm.mobile.core.model.USAGE_GENERIC_ERROR
import cx.lpm.mobile.core.navigation.UsageKey
import cx.lpm.mobile.feature.usage.R
import cx.lpm.mobile.feature.usage.ui.ErrorCard
import cx.lpm.mobile.feature.usage.ui.UsageScaffold

/** The Usage screen wired to its ViewModel: it loads as it opens and lets go as it closes. */
@Composable
fun UsageRoute(
    key: UsageKey,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: UsageViewModel = hiltViewModel<UsageViewModel, UsageViewModel.Factory>(
        creationCallback = { it.create(key) }
    )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    DisposableEffect(viewModel) {
        viewModel.open()
        onDispose { viewModel.close() }
    }
    UsageScreen(
        state = state,
        onBack = onBack,
        onRefresh = viewModel::refresh,
        onRetry = viewModel::retry,
        onToggleReminder = viewModel::toggleReminder,
        modifier = modifier
    )
}

/**
 * How much of each AI coding tool's plan the Mac has used in the current 5-hour and
 * weekly windows, as the desktop Usage page shows it: a card per Claude account and
 * one for Codex, or a dashed panel for a tool with nothing to show yet.
 */
@Composable
fun UsageScreen(
    state: UsageUiState,
    onBack: () -> Unit,
    onRefresh: suspend () -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
    onToggleReminder: (
        limit: String,
        window: String,
        win: LimitWindow,
        name: String
    ) -> Unit = { _, _, _, _ -> }
) {
    UsageScaffold(
        title = stringResource(R.string.usage_title),
        onBack = onBack,
        onRefresh = onRefresh,
        modifier = modifier
    ) {
        when (val body = state.body) {
            UsageBody.Loading -> UsageSkeleton()

            is UsageBody.Failed -> ErrorCard(
                title = stringResource(R.string.usage_error_title),
                message = if (body.message == USAGE_GENERIC_ERROR) {
                    stringResource(R.string.usage_pull_to_refresh)
                } else {
                    body.message
                },
                onRetry = onRetry
            )

            is UsageBody.Loaded -> {
                body.refreshError?.let { UsageRefreshBanner(it, onRetry) }
                val alpha by animateFloatAsState(
                    if (body.dimmed) 0.6f else 1f,
                    tween(200),
                    label = "dim"
                )
                UsageCards(body, state, onToggleReminder, Modifier.alpha(alpha))
            }
        }
    }
}

@Composable
private fun UsageCards(
    body: UsageBody.Loaded,
    state: UsageUiState,
    onToggleReminder: (limit: String, window: String, win: LimitWindow, name: String) -> Unit,
    modifier: Modifier = Modifier
) {
    val now = state.now
    val macNow = state.macNow
    // The bell for one window of the card whose limits are `limit`, where it offers one.
    val reminderFor = { limit: String, name: String ->
        { window: String, win: LimitWindow? ->
            val set = state.reminders.any { it.limit == limit && it.window == window }
            if (state.remindersSupported && win != null &&
                LimitReminder.remindable(win, now, set)
            ) {
                MeterReminder(set) { onToggleReminder(limit, window, win, name) }
            } else {
                null
            }
        }
    }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(16.dp)) {
        body.claude.forEach { card ->
            key(card.key) {
                UsageProviderCard(
                    card.data,
                    now,
                    macNow,
                    card.title,
                    subtitle = card.subtitle,
                    reminder = reminderFor(card.key, card.title)
                )
            }
        }
        if (body.claude.isEmpty()) {
            UsageEmptyPanel(
                provider = "claude",
                name = stringResource(R.string.usage_claude),
                dim = body.claudeEnabled,
                text = stringResource(
                    if (body.claudeEnabled) {
                        R.string.usage_claude_waiting
                    } else {
                        R.string.usage_claude_off
                    }
                )
            )
        }
        val codex = body.codex
        if (codex != null) {
            val codexName = stringResource(R.string.usage_codex)
            UsageProviderCard(
                codex,
                now,
                macNow,
                codexName,
                reminder = reminderFor("codex", codexName)
            )
        } else {
            UsageEmptyPanel(
                provider = "codex",
                name = stringResource(R.string.usage_codex),
                dim = true,
                text = stringResource(R.string.usage_codex_waiting)
            )
        }
        Text(
            stringResource(R.string.usage_footer),
            style = LpmTheme.typography.caption2,
            color = LpmTheme.colors.secondaryLabel,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 4.dp)
        )
    }
}

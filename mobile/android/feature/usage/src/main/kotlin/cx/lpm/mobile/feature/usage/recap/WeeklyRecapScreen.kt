package cx.lpm.mobile.feature.usage.recap

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.component.SegmentedControl
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.RecapPeriod
import cx.lpm.mobile.core.model.RecapPick
import cx.lpm.mobile.core.model.RecapWeek
import cx.lpm.mobile.core.navigation.WeeklyRecapKey
import cx.lpm.mobile.feature.usage.R
import cx.lpm.mobile.feature.usage.ui.UsageScaffold
import kotlinx.coroutines.launch

/** The Weekly recap screen wired to its ViewModel: it reads as it opens, lets go as it closes. */
@Composable
fun WeeklyRecapRoute(
    key: WeeklyRecapKey,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: WeeklyRecapViewModel =
        hiltViewModel<WeeklyRecapViewModel, WeeklyRecapViewModel.Factory>(
            creationCallback = { it.create(key) }
        )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    DisposableEffect(viewModel) {
        viewModel.open()
        onDispose { viewModel.close() }
    }
    WeeklyRecapScreen(
        state = state,
        onBack = onBack,
        onRefresh = viewModel::refresh,
        onSelect = viewModel::select,
        onRetry = viewModel::retry,
        modifier = modifier
    )
}

private val Weeks = listOf(RecapWeek.Last, RecapWeek.This)
private val Periods = listOf(RecapPeriod.Week, RecapPeriod.Month)

/**
 * The desktop's weekly recap on the phone: last week or this week so far, or a month, as
 * the card "My agents' week", shared as an image with its caption.
 */
@Composable
fun WeeklyRecapScreen(
    state: WeeklyRecapUiState,
    onBack: () -> Unit,
    onRefresh: suspend () -> Unit,
    onSelect: (RecapPick) -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier
) {
    val month = state.pick.period == RecapPeriod.Month
    UsageScaffold(
        title = stringResource(if (month) R.string.recap_title_month else R.string.recap_title),
        onBack = onBack,
        onRefresh = onRefresh,
        modifier = modifier
    ) {
        Text(
            stringResource(if (month) R.string.recap_subtitle_month else R.string.recap_subtitle),
            style = LpmTheme.typography.subheadline,
            color = LpmTheme.colors.secondaryLabel
        )
        RecapPickers(state.pick, state.months, onSelect)
        when (val body = state.body) {
            RecapBody.Loading -> RecapLoading()

            is RecapBody.Failed -> RecapFailed(body.message, state.pick.period, onRetry)

            is RecapBody.Empty -> RecapEmpty(body.pick, onSeeThisWeek = {
                onSelect(body.pick.copy(week = RecapWeek.This))
            })

            is RecapBody.Card -> RecapCardShare(body)
        }
        RecapFootnote(state.missing, state.pick.period)
    }
}

/** Last or this, then week or month, read as one phrase: "Last week". */
@Composable
private fun RecapPickers(pick: RecapPick, months: Boolean, onSelect: (RecapPick) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        SegmentedControl(
            options = listOf(
                stringResource(R.string.recap_last),
                stringResource(R.string.recap_this)
            ),
            selectedIndex = Weeks.indexOf(pick.week),
            onSelect = { onSelect(pick.copy(week = Weeks[it])) },
            modifier = Modifier.weight(1f)
        )
        if (months) {
            SegmentedControl(
                options = listOf(
                    stringResource(R.string.recap_week),
                    stringResource(R.string.recap_month)
                ),
                selectedIndex = Periods.indexOf(pick.period),
                onSelect = { onSelect(pick.copy(period = Periods[it])) },
                modifier = Modifier.weight(1f)
            )
        }
    }
}

/** The card, then the button that shares it as an image with its caption. */
@Composable
private fun RecapCardShare(card: RecapBody.Card) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val layer = rememberGraphicsLayer()
    val alpha by animateFloatAsState(if (card.dimmed) 0.6f else 1f, tween(200), label = "dim")
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Box {
            ScaledRecapCard(card.view, Modifier.alpha(alpha))
            RecapCardSnapshot(card.view, layer)
        }
        RecapShareButton(
            onClick = {
                scope.launch {
                    val name = "${card.view.title} ${card.view.range}.png"
                    val file = RecapImageProvider.save(context, layer.toImageBitmap(), name)
                    RecapImageProvider.share(context, file, card.caption)
                }
            }
        )
    }
}

@Composable
private fun RecapFootnote(missing: List<String>, period: RecapPeriod) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        val style = LpmTheme.typography.caption2
        val color = LpmTheme.colors.secondaryLabel
        Text(stringResource(R.string.recap_names_no_projects), style = style, color = color)
        if (missing.isNotEmpty()) {
            Text(
                pluralStringResource(
                    if (period == RecapPeriod.Month) {
                        R.plurals.recap_not_counted_month
                    } else {
                        R.plurals.recap_not_counted
                    },
                    missing.size,
                    joinedNames(missing)
                ),
                style = style,
                color = color
            )
        }
    }
}

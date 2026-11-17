package cx.lpm.mobile.feature.automations.list

import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.component.ListDefaults
import cx.lpm.mobile.core.designsystem.component.SegmentedControl
import cx.lpm.mobile.feature.automations.R

/**
 * The list's filter on top of the rows, as the desktop's Show control: All, then the
 * automations waiting on an answer and those whose last run failed, each with its count.
 */
@Composable
internal fun AutomationListFilterBar(
    state: AutomationsUiState,
    onSelect: (AutomationListFilter) -> Unit,
    modifier: Modifier = Modifier
) {
    val filters = state.filters
    val labels = filters.map {
        when (it) {
            AutomationListFilter.All -> stringResource(
                R.string.automations_filter_all,
                state.allCount
            )

            AutomationListFilter.NeedsYou ->
                stringResource(R.string.automations_filter_needs_you, state.needsCount)

            AutomationListFilter.Failed ->
                stringResource(R.string.automations_filter_failed, state.failedCount)
        }
    }
    SegmentedControl(
        options = labels,
        selectedIndex = filters.indexOf(state.filter),
        onSelect = { onSelect(filters[it]) },
        modifier = modifier.padding(
            start = ListDefaults.Margin,
            end = ListDefaults.Margin,
            bottom = 16.dp
        )
    )
}

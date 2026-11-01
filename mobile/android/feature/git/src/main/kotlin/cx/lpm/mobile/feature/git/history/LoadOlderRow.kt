package cx.lpm.mobile.feature.git.history

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.component.PlainListDefaults
import cx.lpm.mobile.core.designsystem.component.plainListSeparator
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.git.R

/** "Load older commits" under the list, "Loading…" (and off) while a page is out. */
@Composable
internal fun LoadOlderRow(loading: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val colors = LpmTheme.colors
    Box(
        modifier
            .plainListSeparator(colors.listSeparator)
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .clickable(enabled = !loading, role = Role.Button, onClick = onClick)
            .padding(
                horizontal = PlainListDefaults.RowPadding,
                vertical = PlainListDefaults.RowInset
            ),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = stringResource(
                if (loading) R.string.git_history_loading_more else R.string.git_history_load_older
            ),
            style = LpmTheme.typography.subheadline,
            color = if (loading) colors.tertiaryLabel else colors.tint
        )
    }
}

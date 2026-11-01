package cx.lpm.mobile.feature.git.history

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ActivityIndicatorSize
import cx.lpm.mobile.core.designsystem.component.PlainListDefaults
import cx.lpm.mobile.core.designsystem.theme.LpmTheme

/** A small spinner beside what's on its way ("Loading history…", "Loading files…"). */
@Composable
internal fun LoadingLine(
    text: String,
    modifier: Modifier = Modifier,
    minHeight: Dp = 44.dp,
    verticalPadding: Dp = PlainListDefaults.RowInset
) {
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = minHeight)
            .padding(horizontal = PlainListDefaults.RowPadding, vertical = verticalPadding),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        ActivityIndicator(size = ActivityIndicatorSize.Small)
        Text(text, style = LpmTheme.typography.footnote, color = LpmTheme.colors.secondaryLabel)
    }
}

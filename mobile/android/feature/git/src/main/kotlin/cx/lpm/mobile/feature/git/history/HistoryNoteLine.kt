package cx.lpm.mobile.feature.git.history

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.component.PlainListDefaults
import cx.lpm.mobile.core.designsystem.theme.LpmTheme

/** A gray line in a list's place: "No commits on this branch yet.", "This commit changes no files." */
@Composable
internal fun HistoryNoteLine(
    text: String,
    modifier: Modifier = Modifier,
    minHeight: Dp = 44.dp,
    verticalPadding: Dp = PlainListDefaults.RowInset
) {
    Text(
        text = text,
        style = LpmTheme.typography.subheadline,
        color = LpmTheme.colors.secondaryLabel,
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = minHeight)
            .padding(horizontal = PlainListDefaults.RowPadding, vertical = verticalPadding)
    )
}

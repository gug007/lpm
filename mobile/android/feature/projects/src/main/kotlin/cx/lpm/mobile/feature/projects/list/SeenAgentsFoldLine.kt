package cx.lpm.mobile.feature.projects.list

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.projects.R as ProjectsR

/**
 * The line seen rows past the Mac's limit fold into: it opens them in place, then
 * folds them again.
 */
@Composable
fun SeenAgentsFoldLine(
    folded: Int,
    expanded: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .deckLine(onClick = onToggle),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = if (expanded) {
                stringResource(ProjectsR.string.agents_show_fewer)
            } else {
                pluralStringResource(ProjectsR.plurals.agents_more_seen, folded, folded)
            },
            style = LpmTheme.typography.subheadline,
            color = LpmTheme.colors.secondaryLabel
        )
        Spacer(Modifier.weight(1f))
        Icon(
            painter = painterResource(
                if (expanded) R.drawable.ic_keyboard_arrow_up else R.drawable.ic_keyboard_arrow_down
            ),
            contentDescription = null,
            tint = LpmTheme.colors.tertiaryLabel,
            modifier = Modifier.size(17.dp)
        )
    }
}

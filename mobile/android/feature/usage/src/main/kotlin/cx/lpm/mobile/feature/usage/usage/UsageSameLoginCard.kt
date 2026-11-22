package cx.lpm.mobile.feature.usage.usage

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.component.StatusDot
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.ui.providerMeta
import cx.lpm.mobile.core.ui.tint
import cx.lpm.mobile.feature.usage.R
import cx.lpm.mobile.feature.usage.ui.groupedCard

/**
 * A Claude account signed in as the same Claude account as an earlier one, which
 * happens when `/login` inside it picks that account: its usage is that account's,
 * shown on the earlier card (iOS `UsageSameLoginCardView`, the desktop's
 * `UsageSameLoginCard`). Signing it in again happens on the Mac.
 */
@Composable
internal fun UsageSameLoginCard(
    title: String,
    email: String?,
    sameAsTitle: String,
    modifier: Modifier = Modifier
) {
    val colors = LpmTheme.colors
    Column(
        modifier
            .fillMaxWidth()
            .groupedCard(color = colors.secondarySystemGroupedBackground)
            .padding(16.dp)
            .semantics(mergeDescendants = true) {}
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            StatusDot(providerMeta("claude").tint, Modifier.alpha(0.5f))
            Text(
                title,
                style = LpmTheme.typography.subheadline.copy(fontWeight = FontWeight.SemiBold)
            )
            if (email != null) {
                Text(
                    email,
                    style = LpmTheme.typography.caption1,
                    color = colors.secondaryLabel,
                    maxLines = 1,
                    overflow = TextOverflow.MiddleEllipsis
                )
            }
        }
        CardDivider()
        Text(
            stringResource(R.string.usage_same_login, sameAsTitle),
            style = LpmTheme.typography.footnote,
            color = colors.orange
        )
        Text(
            stringResource(R.string.usage_same_login_hint),
            style = LpmTheme.typography.caption1,
            color = colors.secondaryLabel,
            modifier = Modifier.padding(top = 6.dp)
        )
    }
}

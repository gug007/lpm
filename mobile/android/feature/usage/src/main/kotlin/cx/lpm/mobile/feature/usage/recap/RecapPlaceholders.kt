package cx.lpm.mobile.feature.usage.recap

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.CapsuleButton
import cx.lpm.mobile.core.designsystem.component.LinkButton
import cx.lpm.mobile.core.designsystem.component.Shimmer
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.RecapPeriod
import cx.lpm.mobile.core.model.RecapPick
import cx.lpm.mobile.core.model.RecapWeek
import cx.lpm.mobile.feature.usage.R
import cx.lpm.mobile.feature.usage.ui.groupedCard

/** A card-shaped stand-in, in the card's own colors, while the Mac reads the week or month. */
@Composable
internal fun RecapLoading(modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(10.dp)
    Column(
        modifier
            .fillMaxWidth()
            .aspectRatio(RECAP_WIDTH / 438f)
            .background(RecapColors.ground, shape)
            .border(1.dp, RecapColors.border, shape),
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Shimmer {
            Spacer(
                Modifier
                    .size(width = 120.dp, height = 6.dp)
                    .background(RecapColors.border, CircleShape)
            )
        }
        Text(
            stringResource(R.string.recap_loading),
            style = LpmTheme.typography.footnote,
            color = RecapColors.muted
        )
    }
}

/** The week or month couldn't be read: why, and "Try again". */
@Composable
internal fun RecapFailed(
    message: String,
    period: RecapPeriod,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier
            .fillMaxWidth()
            .groupedCard()
            .padding(horizontal = 20.dp, vertical = 32.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            painter = painterResource(DesignR.drawable.ic_warning),
            contentDescription = null,
            tint = LpmTheme.colors.orange,
            modifier = Modifier.size(37.dp)
        )
        Text(
            stringResource(
                if (period ==
                    RecapPeriod.Month
                ) {
                    R.string.recap_error_month
                } else {
                    R.string.recap_error
                },
                message
            ),
            style = LpmTheme.typography.subheadline,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(2.dp))
        CapsuleButton(
            text = stringResource(R.string.recap_try_again),
            onClick = onRetry,
            prominent = true,
            textStyle = LpmTheme.typography.headline
        )
    }
}

/** No agent time in the week or month; from last one, a way to this one so far. */
@Composable
internal fun RecapEmpty(pick: RecapPick, onSeeThisWeek: () -> Unit, modifier: Modifier = Modifier) {
    val colors = LpmTheme.colors
    val last = pick.week == RecapWeek.Last
    val month = pick.period == RecapPeriod.Month
    Column(
        modifier
            .fillMaxWidth()
            .groupedCard()
            .padding(horizontal = 20.dp, vertical = 32.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            painter = painterResource(DesignR.drawable.ic_calendar_month),
            contentDescription = null,
            tint = colors.secondaryLabel,
            modifier = Modifier.size(38.dp)
        )
        Text(
            stringResource(
                when {
                    month && last -> R.string.recap_empty_last_month
                    month -> R.string.recap_empty_this_month
                    last -> R.string.recap_empty_last
                    else -> R.string.recap_empty_this
                }
            ),
            style = LpmTheme.typography.headline,
            textAlign = TextAlign.Center
        )
        Text(
            stringResource(R.string.recap_empty_text),
            style = LpmTheme.typography.subheadline,
            color = colors.secondaryLabel,
            textAlign = TextAlign.Center
        )
        if (last) {
            LinkButton(
                text = stringResource(
                    if (month) R.string.recap_see_this_month else R.string.recap_see_this_week
                ),
                onClick = onSeeThisWeek,
                modifier = Modifier.padding(top = 2.dp),
                textStyle = LpmTheme.typography.subheadline.copy(fontWeight = FontWeight.Medium)
            )
        }
    }
}

package cx.lpm.mobile.feature.usage.usage

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ActivityIndicatorSize
import cx.lpm.mobile.core.designsystem.component.CapsuleButton
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.ProviderLimits
import cx.lpm.mobile.feature.usage.R
import kotlin.math.roundToLong

/** What "Read it now" needs: whether it is running, why the last one failed, how to start it. */
data class UsageReader(val busy: Boolean, val error: String?, val read: () -> Unit)

/**
 * In place of the meters when a reading is old ([OLD_MS]): how old, what it said then,
 * and a way to read the account again (iOS `UsageOldReadingView`, the desktop's
 * `UsageOldReading`). [macNow] is the Mac's clock, which stamped `updatedAt`.
 */
@Composable
internal fun UsageOldReading(
    data: ProviderLimits,
    macNow: Double,
    modifier: Modifier = Modifier,
    reader: UsageReader? = null
) {
    val colors = LpmTheme.colors
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            lastReadText(data.updatedAt, macNow),
            style = LpmTheme.typography.body.copy(fontWeight = FontWeight.Medium),
            color = colors.secondaryLabel
        )
        val then = listOfNotNull(
            data.weekly?.let {
                stringResource(R.string.usage_weekly_was, it.usedPercent.roundToLong())
            },
            data.fiveHour?.takeUnless { data.noFiveHour }?.let {
                stringResource(R.string.usage_five_hour_was, it.usedPercent.roundToLong())
            }
        )
        if (then.isNotEmpty()) {
            Text(
                stringResource(R.string.usage_then, then.joinToString(" · ")),
                style = LpmTheme.typography.footnote,
                color = colors.secondaryLabel
            )
        }
        if (reader != null) {
            CapsuleButton(
                stringResource(
                    if (reader.busy) R.string.usage_reading else R.string.usage_read_now
                ),
                onClick = reader.read,
                prominent = true,
                enabled = !reader.busy,
                modifier = Modifier.padding(top = 4.dp),
                leading = {
                    if (reader.busy) {
                        ActivityIndicator(size = ActivityIndicatorSize.Mini, color = Color.White)
                    } else {
                        Icon(
                            painterResource(DesignR.drawable.ic_refresh),
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(12.dp)
                        )
                    }
                }
            )
            Text(
                stringResource(R.string.usage_read_hint),
                style = LpmTheme.typography.caption1,
                color = colors.secondaryLabel
            )
            reader.error?.let {
                Text(it, style = LpmTheme.typography.caption1, color = colors.red)
            }
        }
    }
}

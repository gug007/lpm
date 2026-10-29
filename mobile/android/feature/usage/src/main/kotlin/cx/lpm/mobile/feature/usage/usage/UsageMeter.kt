package cx.lpm.mobile.feature.usage.usage

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.LimitWindow
import cx.lpm.mobile.feature.usage.R

/** The bell on one meter: whether its reset reminder is set, and what a tap does. */
internal data class MeterReminder(val set: Boolean, val toggle: () -> Unit)

/**
 * One plan-usage window meter, the desktop `UsageMeter`: the percentage with its pace
 * verdict beside it (below it once large text leaves no room), the bar with its pace
 * tick, and when the window resets — or runs out first.
 */
@Composable
internal fun UsageMeter(
    label: String,
    win: LimitWindow?,
    windowMs: Double,
    now: Double,
    stale: Boolean,
    modifier: Modifier = Modifier,
    reminder: MeterReminder? = null
) {
    val meter = meterState(win, windowMs, now)
    Box(modifier.fillMaxWidth()) {
        MeterBody(label, meter, stale, reminder?.set == true)
        if (reminder != null && meter.hasData) {
            ReminderBell(label, reminder, Modifier.align(Alignment.TopEnd))
        }
    }
}

@Composable
private fun ReminderBell(label: String, reminder: MeterReminder, modifier: Modifier = Modifier) {
    val description = stringResource(R.string.usage_remind_me, label.lowercase())
    val icon = if (reminder.set) {
        DesignR.drawable.ic_notifications_fill
    } else {
        DesignR.drawable.ic_notifications
    }
    Icon(
        painterResource(icon),
        contentDescription = description,
        tint = if (reminder.set) LpmTheme.colors.orange else LpmTheme.colors.secondaryLabel,
        modifier = modifier
            .minimumInteractiveComponentSize()
            .semantics { selected = reminder.set }
            .clickable(role = Role.Button, onClick = reminder.toggle)
            .size(18.dp)
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MeterBody(label: String, meter: MeterState, stale: Boolean, reminderSet: Boolean) {
    val colors = LpmTheme.colors
    val type = LpmTheme.typography
    val description = stringResource(R.string.usage_meter_label, label)
    val resetLine = if (reminderSet && meter.resetLine.isNotEmpty()) {
        meter.resetLine + stringResource(R.string.usage_reminder_set)
    } else {
        meter.resetLine
    }
    Column(
        Modifier
            .fillMaxWidth()
            .clearAndSetSemantics {
                contentDescription = description
                stateDescription = meter.accessibilityValue
            },
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(
            label.uppercase(),
            style = type.caption2.copy(fontWeight = FontWeight.SemiBold, letterSpacing = 0.6.sp),
            color = colors.secondaryLabel
        )
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(5.dp),
            verticalArrangement = Arrangement.spacedBy(3.dp)
        ) {
            Row(
                Modifier.alignByBaseline(),
                horizontalArrangement = Arrangement.spacedBy(5.dp)
            ) {
                Text(
                    if (meter.hasData) {
                        meter.shown.toString()
                    } else {
                        stringResource(
                            R.string.usage_no_value
                        )
                    },
                    style = type.title2.copy(
                        fontWeight = FontWeight.SemiBold,
                        fontFeatureSettings = "tnum"
                    ),
                    color = if (meter.hasData && !stale) colors.label else colors.secondaryLabel,
                    modifier = Modifier.alignByBaseline()
                )
                if (meter.hasData) {
                    Text(
                        stringResource(R.string.usage_percent),
                        style = type.subheadline,
                        color = colors.secondaryLabel,
                        modifier = Modifier.alignByBaseline()
                    )
                }
            }
            if (meter.verdict.isNotEmpty()) {
                Text(
                    meter.verdict,
                    style = type.caption1,
                    color = when (meter.verdictTone) {
                        VerdictTone.Critical -> colors.red
                        VerdictTone.Warning -> colors.orange
                        VerdictTone.Good -> colors.green
                        VerdictTone.Secondary -> colors.secondaryLabel
                    },
                    modifier = Modifier.alignByBaseline()
                )
            }
        }
        MeterBar(meter.barFraction, meter.tick, stale)
        if (resetLine.isNotEmpty() || meter.runsOut.isNotEmpty()) {
            val style = type.caption1.copy(fontFeatureSettings = "tnum")
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                if (resetLine.isNotEmpty()) {
                    Text(resetLine, style = style, color = colors.secondaryLabel)
                }
                if (meter.runsOut.isNotEmpty()) {
                    Text(meter.runsOut, style = style, color = colors.orange)
                }
            }
        }
    }
}

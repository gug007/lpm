package cx.lpm.mobile.feature.mac.keepawake

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.component.ButtonRow
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.component.ListSection
import cx.lpm.mobile.core.designsystem.component.SegmentedControl
import cx.lpm.mobile.core.designsystem.component.StepperRow
import cx.lpm.mobile.core.designsystem.component.TimeOfDayRow
import cx.lpm.mobile.core.model.MacKeepAwake
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.ui.tickingNow
import cx.lpm.mobile.feature.mac.R
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

/** "Custom Time" in the connection sheet for `session`'s Mac. */
@Composable
fun KeepAwakeCustomTimeRoute(session: SessionKey = SessionKey.Live, onDone: () -> Unit) {
    val viewModel = keepAwakeViewModel(session)
    KeepAwakeCustomTime(onStart = { minutes ->
        viewModel.set(MacKeepAwake.Mode.Timed, minutes)
        onDone()
    })
}

/**
 * Keep the Mac awake for any number of hours and minutes, or until a time of day
 * (iOS `KeepAwakeCustomTime`).
 */
@Composable
internal fun KeepAwakeCustomTime(onStart: (minutes: Int) -> Unit) {
    var until by rememberSaveable { mutableStateOf(false) }
    var hours by rememberSaveable { mutableIntStateOf(1) }
    var minutes by rememberSaveable { mutableIntStateOf(30) }
    var clock by rememberSaveable { mutableIntStateOf(((LocalTime.now().hour + 2) % 24) * 60) }
    val total = hours * 60 + minutes
    ListSection {
        ListRow(verticalPadding = 14.dp) {
            SegmentedControl(
                options = listOf(
                    stringResource(R.string.keep_awake_for),
                    stringResource(R.string.keep_awake_until)
                ),
                selectedIndex = if (until) 1 else 0,
                onSelect = { until = it == 1 },
                modifier = Modifier.weight(1f)
            )
        }
    }
    if (until) {
        val now = Instant.ofEpochMilli(tickingNow())
        ListSection(footer = untilFooter(untilEnd(clock, now), now)) {
            TimeOfDayRow(
                title = stringResource(R.string.keep_awake_until_time),
                minutes = clock,
                onChange = { clock = it },
                confirmLabel = stringResource(R.string.keep_awake_until_ok),
                dismissLabel = stringResource(R.string.keep_awake_until_cancel)
            )
        }
    } else {
        ListSection(
            footer = stringResource(R.string.keep_awake_custom_footer, MacKeepAwake.span(total))
        ) {
            StepperRow(stringResource(R.string.keep_awake_hours), hours, { hours = it }, 0..99)
            StepperRow(
                stringResource(R.string.keep_awake_minutes),
                minutes,
                { minutes = it },
                0..59
            )
        }
    }
    ListSection {
        ButtonRow(
            text = stringResource(R.string.keep_awake_menu),
            onClick = {
                if (until) {
                    val now = Instant.now()
                    onStart(MacKeepAwake.minutesUntil(untilEnd(clock, now).toInstant(), now))
                } else {
                    onStart(total)
                }
            },
            enabled = until || total >= 1
        )
    }
}

private fun untilEnd(clock: Int, now: Instant): ZonedDateTime =
    MacKeepAwake.nextTime(clock / 60, clock % 60, now, ZoneId.systemDefault())

@Composable
private fun untilFooter(end: ZonedDateTime, now: Instant): String {
    val time = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).format(end)
    val today = end.toLocalDate() == now.atZone(end.zone).toLocalDate()
    val footer = if (today) {
        R.string.keep_awake_until_today_footer
    } else {
        R.string.keep_awake_until_tomorrow_footer
    }
    return stringResource(footer, time)
}

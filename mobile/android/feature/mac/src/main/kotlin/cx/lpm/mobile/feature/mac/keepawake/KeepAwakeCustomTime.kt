package cx.lpm.mobile.feature.mac.keepawake

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import cx.lpm.mobile.core.designsystem.component.ButtonRow
import cx.lpm.mobile.core.designsystem.component.ListSection
import cx.lpm.mobile.core.designsystem.component.StepperRow
import cx.lpm.mobile.core.model.MacKeepAwake
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.feature.mac.R

/** "Custom Time" in the connection sheet for `session`'s Mac. */
@Composable
fun KeepAwakeCustomTimeRoute(session: SessionKey = SessionKey.Live, onDone: () -> Unit) {
    val viewModel = keepAwakeViewModel(session)
    KeepAwakeCustomTime(onStart = { minutes ->
        viewModel.set(MacKeepAwake.Mode.Timed, minutes)
        onDone()
    })
}

/** Keep the Mac awake for any number of hours and minutes (iOS `KeepAwakeCustomTime`). */
@Composable
fun KeepAwakeCustomTime(onStart: (minutes: Int) -> Unit) {
    var hours by rememberSaveable { mutableIntStateOf(1) }
    var minutes by rememberSaveable { mutableIntStateOf(30) }
    val total = hours * 60 + minutes
    ListSection(
        footer = stringResource(R.string.keep_awake_custom_footer, MacKeepAwake.span(total))
    ) {
        StepperRow(stringResource(R.string.keep_awake_hours), hours, { hours = it }, 0..99)
        StepperRow(stringResource(R.string.keep_awake_minutes), minutes, { minutes = it }, 0..59)
    }
    ListSection {
        ButtonRow(
            text = stringResource(R.string.keep_awake_menu),
            onClick = { onStart(total) },
            enabled = total >= 1
        )
    }
}

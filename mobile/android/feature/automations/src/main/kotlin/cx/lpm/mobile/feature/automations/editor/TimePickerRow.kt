package cx.lpm.mobile.feature.automations.editor

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import cx.lpm.mobile.core.designsystem.component.TimeOfDayRow
import cx.lpm.mobile.feature.automations.R
import java.util.Locale

/** A [TimeOfDayRow] for [time] as the job's YAML writes it, "HH:mm". */
@Composable
fun TimePickerRow(
    title: String,
    time: String,
    fallbackMinutes: Int,
    onTimeChange: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    TimeOfDayRow(
        title = title,
        minutes = parseTimeMinutes(time) ?: fallbackMinutes,
        onChange = { m -> onTimeChange(String.format(Locale.ROOT, "%02d:%02d", m / 60, m % 60)) },
        confirmLabel = stringResource(R.string.ok),
        dismissLabel = stringResource(R.string.cancel),
        modifier = modifier
    )
}

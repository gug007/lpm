package cx.lpm.mobile.core.designsystem.component

import android.text.format.DateFormat
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

/**
 * The title, and a time of day in a gray capsule that opens a clock (iOS
 * `DatePicker` .hourAndMinute). [minutes] counts from midnight.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TimeOfDayRow(
    title: String,
    minutes: Int,
    onChange: (Int) -> Unit,
    confirmLabel: String,
    dismissLabel: String,
    modifier: Modifier = Modifier
) {
    val local = LocalTime.of(minutes / 60, minutes % 60)
    var picking by remember { mutableStateOf(false) }
    ListRow(
        modifier = modifier,
        verticalPadding = 8.dp,
        trailing = {
            Text(
                text = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).format(local),
                style = LpmTheme.typography.body,
                modifier = Modifier
                    .clip(CircleShape)
                    .background(LpmTheme.colors.tertiarySystemFill)
                    .clickableNoIndication(onClick = { picking = true }, onClickLabel = title)
                    .padding(horizontal = 12.dp, vertical = 7.dp)
            )
        }
    ) {
        Text(
            text = title,
            style = LpmTheme.typography.body,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )
    }
    if (picking) {
        val picker = rememberTimePickerState(
            initialHour = local.hour,
            initialMinute = local.minute,
            is24Hour = DateFormat.is24HourFormat(LocalContext.current)
        )
        AlertDialog(
            onDismissRequest = { picking = false },
            confirmButton = {
                TextButton(onClick = {
                    picking = false
                    onChange(picker.hour * 60 + picker.minute)
                }) { Text(confirmLabel) }
            },
            dismissButton = {
                TextButton(onClick = { picking = false }) { Text(dismissLabel) }
            },
            text = { TimePicker(state = picker) }
        )
    }
}

package cx.lpm.mobile.feature.terminal

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.component.CapsuleButton
import cx.lpm.mobile.core.designsystem.theme.LpmTheme

/**
 * In place of the composer under a conversation whose terminal is driven elsewhere:
 * reading it needs no control, sending does.
 */
@Composable
internal fun ControlHandoffBar(
    ownerLabel: String,
    background: Color,
    onTakeControl: () -> Unit,
    modifier: Modifier = Modifier
) {
    val haptics = LocalHapticFeedback.current
    TerminalBottomBar(background, modifier) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = stringResource(R.string.terminal_active_on, ownerLabel),
                modifier = Modifier.weight(1f),
                style = LpmTheme.typography.footnote,
                color = Color.White.copy(alpha = 0.7f),
                maxLines = 2
            )
            CapsuleButton(
                text = stringResource(R.string.terminal_take_control),
                onClick = {
                    haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
                    onTakeControl()
                },
                color = Color.White,
                textStyle = LpmTheme.typography.subheadline
            )
        }
    }
}

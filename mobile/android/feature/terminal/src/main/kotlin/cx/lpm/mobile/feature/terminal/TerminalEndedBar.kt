package cx.lpm.mobile.feature.terminal

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.data.terminals.TerminalEnding
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ActivityIndicatorSize
import cx.lpm.mobile.core.designsystem.component.CapsuleButton
import cx.lpm.mobile.core.designsystem.component.LinkButton
import cx.lpm.mobile.core.designsystem.theme.LpmTheme

private val MUTED = Color.White.copy(alpha = 0.7f)

/**
 * In place of the composer once a terminal's process has ended: nothing typed here
 * could reach it, so this says so and offers the two ways on, as the desktop's bar
 * does. Restart shows only where the Mac can run it again.
 */
@Composable
internal fun TerminalEndedBar(
    label: String,
    ending: TerminalEnding,
    background: Color,
    onRestart: (() -> Unit)?,
    onClose: () -> Unit,
    modifier: Modifier = Modifier
) {
    TerminalBottomBar(background, modifier) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(
                text = if (ending.gone) {
                    stringResource(R.string.terminal_has_ended, label)
                } else {
                    stringResource(R.string.terminal_exited_with_code, label, ending.code)
                },
                style = LpmTheme.typography.footnote,
                color = MUTED,
                maxLines = 2
            )
            Row(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (onRestart != null) {
                    CapsuleButton(
                        text = stringResource(R.string.terminal_restart),
                        onClick = onRestart,
                        enabled = !ending.restarting,
                        color = Color.White,
                        textStyle = LpmTheme.typography.subheadline,
                        leading = {
                            if (ending.restarting) {
                                ActivityIndicator(size = ActivityIndicatorSize.Small)
                            } else {
                                Icon(
                                    painter = painterResource(DesignR.drawable.ic_refresh),
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }
                    )
                }
                LinkButton(
                    text = stringResource(R.string.terminal_close_tab),
                    onClick = onClose,
                    icon = painterResource(DesignR.drawable.ic_close),
                    iconSize = 16.dp,
                    color = MUTED
                )
            }
        }
    }
}

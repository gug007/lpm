package cx.lpm.mobile.core.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ActivityIndicatorSize
import cx.lpm.mobile.core.designsystem.component.GlassCapsuleButton
import cx.lpm.mobile.core.designsystem.component.LpmTopBar
import cx.lpm.mobile.core.designsystem.theme.LpmTheme

/**
 * An editor sheet's bar: "Cancel", the title, and the bold confirm button — a spinner
 * in its place while the Mac is writing.
 */
@Composable
fun EditorTopBar(
    title: String,
    onCancel: () -> Unit,
    confirmLabel: String,
    onConfirm: () -> Unit,
    confirmEnabled: Boolean,
    busy: Boolean,
    modifier: Modifier = Modifier
) {
    LpmTopBar(
        title = title,
        modifier = modifier.padding(top = 16.dp),
        windowInsets = WindowInsets(0),
        leading = {
            GlassCapsuleButton(text = stringResource(R.string.ui_cancel), onClick = onCancel)
        },
        trailing = {
            if (busy) {
                Box(Modifier.size(44.dp), contentAlignment = Alignment.Center) {
                    ActivityIndicator(size = ActivityIndicatorSize.Small)
                }
            } else {
                GlassCapsuleButton(
                    text = confirmLabel,
                    onClick = onConfirm,
                    enabled = confirmEnabled,
                    textStyle = LpmTheme.typography.headline
                )
            }
        }
    )
}

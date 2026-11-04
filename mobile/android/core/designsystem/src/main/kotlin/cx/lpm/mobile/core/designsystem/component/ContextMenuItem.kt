package cx.lpm.mobile.core.designsystem.component

import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.theme.LpmTheme

/**
 * An action in a [ContextMenu]: leading [icon] (named [iconDescription] when it
 * says something, like a checkmark, and colored apart from the row by [iconTint]),
 * [title], optional gray [subtitle] ("4 changed files"), optional [trailingIcon].
 * [destructive] draws it red.
 * Picking it closes the menu, then runs [onClick].
 */
@Composable
fun ContextMenuItem(
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: Painter? = null,
    iconDescription: String? = null,
    iconTint: Color? = null,
    subtitle: String? = null,
    trailingIcon: Painter? = null,
    destructive: Boolean = false,
    enabled: Boolean = true
) {
    val controller = LocalContextMenuController.current
    val tint = if (destructive) LpmTheme.colors.red else LpmTheme.colors.label
    MenuRow(
        title = title,
        onClick = {
            controller?.dismiss()
            onClick()
        },
        modifier = modifier,
        icon = icon,
        iconDescription = iconDescription,
        iconTint = iconTint,
        subtitle = subtitle,
        destructive = destructive,
        enabled = enabled,
        trailing = trailingIcon?.let {
            {
                Icon(
                    painter = it,
                    contentDescription = null,
                    tint = tint,
                    modifier = Modifier.size(22.dp)
                )
            }
        }
    )
}

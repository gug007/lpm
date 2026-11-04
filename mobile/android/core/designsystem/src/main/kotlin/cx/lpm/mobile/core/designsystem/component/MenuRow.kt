package cx.lpm.mobile.core.designsystem.component

import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.theme.LpmTheme

/**
 * One row of a [ContextMenu]: the icon centered in a 24 dp column 40 dp in from the
 * panel's edge and the title (and subtitle) from 65 dp — or, as on iOS, from the
 * icon's place when there is none — a trailing slot, and a rounded highlight while
 * pressed. An [iconDescription] names the icon as iOS names the row's symbol
 * ("selected" for a checkmark); [iconTint] colors the icon alone.
 */
@Composable
internal fun MenuRow(
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: Painter? = null,
    iconDescription: String? = null,
    iconTint: Color? = null,
    subtitle: String? = null,
    destructive: Boolean = false,
    enabled: Boolean = true,
    emphasized: Boolean = false,
    trailing: (@Composable () -> Unit)? = null
) {
    val colors = LpmTheme.colors
    val target = remember { TouchTarget() }
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val tint = if (destructive) colors.red else colors.label
    // As on iOS, an item that's off greys its title and icon; its subtitle stays.
    val dimmed = if (enabled) Modifier else Modifier.alpha(DISABLED_ALPHA)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickableTarget(target, interaction, enabled, Role.Button, onClick)
            .drawBehind {
                if (pressed) {
                    val inset = 10.dp.toPx()
                    drawRoundRect(
                        color = colors.systemFill,
                        topLeft = Offset(inset, 0f),
                        size = Size(size.width - inset * 2, size.height),
                        cornerRadius = CornerRadius(14.dp.toPx())
                    )
                }
            }
            .padding(
                start = 28.dp,
                end = 27.dp,
                top = 10.dp,
                bottom = if (subtitle !=
                    null
                ) {
                    8.dp
                } else {
                    10.dp
                }
            ),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (icon != null) {
            Box(dimmed.width(24.dp), contentAlignment = Alignment.Center) {
                Icon(
                    painter = icon,
                    contentDescription = iconDescription,
                    tint = iconTint ?: tint,
                    modifier = Modifier.size(22.dp)
                )
            }
            Spacer(Modifier.width(12.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(
                text = title,
                style = LpmTheme.typography.body.copy(
                    fontWeight = if (emphasized) FontWeight.SemiBold else FontWeight.Normal
                ),
                color = tint,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = dimmed
            )
            if (subtitle != null) {
                Text(
                    text = subtitle,
                    style = LpmTheme.typography.subheadline,
                    color = colors.secondaryLabel,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
        if (trailing != null) {
            Spacer(Modifier.width(12.dp))
            Box(dimmed) { trailing() }
        }
    }
}

private const val DISABLED_ALPHA = 0.27f

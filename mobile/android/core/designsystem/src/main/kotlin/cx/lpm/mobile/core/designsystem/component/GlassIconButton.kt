package cx.lpm.mobile.core.designsystem.component

import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.theme.LpmTheme

/**
 * A round 44 dp glass button holding one symbol: back, "…" More, ⚡, layers, +.
 * [contentDescription] is its accessible name and must match iOS ("More", "Add"…).
 * While [busy] a spinner stands in for the symbol, as a `ProgressView` label does.
 */
@Composable
fun GlassIconButton(
    icon: Painter,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    tint: Color = LpmTheme.colors.label,
    iconSize: Dp = 24.dp,
    busy: Boolean = false
) {
    val colors = LpmTheme.colors
    val target = remember { TouchTarget() }
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    Box(
        modifier = modifier
            .clickableTarget(target, interaction, enabled, Role.Button, onClick)
            .size(44.dp)
            .glass(CircleShape, colors, pressed),
        contentAlignment = Alignment.Center
    ) {
        if (busy) {
            ActivityIndicator(
                size = ActivityIndicatorSize.Small,
                modifier = Modifier.semantics { this.contentDescription = contentDescription }
            )
        } else {
            Icon(
                painter = icon,
                contentDescription = contentDescription,
                tint = if (enabled) tint else colors.tertiaryLabel,
                modifier = Modifier.size(iconSize)
            )
        }
    }
}

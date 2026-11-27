package cx.lpm.mobile.core.designsystem.component

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.theme.LpmTheme

enum class ProminentButtonSize(
    internal val minHeight: Dp,
    internal val padding: PaddingValues,
    internal val maxLines: Int
) {
    Regular(40.dp, PaddingValues(horizontal = 12.dp, vertical = 8.dp), maxLines = 1),
    Large(50.dp, PaddingValues(horizontal = 20.dp, vertical = 14.dp), maxLines = Int.MAX_VALUE)
}

/**
 * iOS's `.borderedProminent` button across the width, large unless [size] says
 * otherwise: a capsule in [containerColor] with [icon] before its label. While [busy] a
 * spinner in [spinnerColor] takes the icon's place, or the label's when there's no icon.
 */
@Composable
fun ProminentButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: Painter? = null,
    busy: Boolean = false,
    enabled: Boolean = true,
    containerColor: Color = LpmTheme.colors.tint,
    contentColor: Color = Color.White,
    size: ProminentButtonSize = ProminentButtonSize.Large,
    spinnerColor: Color =
        if (size == ProminentButtonSize.Large) Color.White else LpmTheme.colors.gray
) {
    val colors = LpmTheme.colors
    val large = size == ProminentButtonSize.Large
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val content = if (enabled) contentColor else colors.tertiaryLabel
    val style = if (large) LpmTheme.typography.body else LpmTheme.typography.subheadline
    val spinnerOverLabel = busy && icon == null
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = size.minHeight)
            .alpha(if (pressed) 0.75f else 1f)
            .clip(CircleShape)
            .background(if (enabled) containerColor else colors.tertiarySystemFill)
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                role = Role.Button,
                onClick = onClick
            )
            .padding(size.padding),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (icon != null) {
            if (busy) {
                ActivityIndicator(size = ActivityIndicatorSize.Small, color = spinnerColor)
            } else {
                Icon(
                    painter = icon,
                    contentDescription = null,
                    tint = content,
                    modifier = Modifier.size(22.dp)
                )
            }
        }
        Box(contentAlignment = Alignment.Center) {
            Text(
                text = text,
                style = style.copy(fontWeight = FontWeight.SemiBold),
                color = content,
                modifier = Modifier.alpha(if (spinnerOverLabel) 0f else 1f),
                maxLines = size.maxLines
            )
            if (spinnerOverLabel) {
                ActivityIndicator(size = ActivityIndicatorSize.Small, color = spinnerColor)
            }
        }
    }
}

package cx.lpm.mobile.feature.projects.talk

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.layout.layout
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cx.lpm.mobile.core.designsystem.component.LinkButton
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.designsystem.theme.dimmed

/**
 * One step of a Talk plan (iOS `TalkPlanRow`): its tile, what it does over the thing it
 * does it to, and the control that changes it. A line runs down to the next step's tile.
 */
@Composable
internal fun TalkPlanRow(
    icon: Painter,
    iconSize: Dp,
    title: String,
    change: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    tint: Color = LpmTheme.colors.secondaryLabel,
    connects: Boolean = true,
    value: @Composable () -> Unit
) {
    val colors = LpmTheme.colors
    val line = colors.separator.dimmed(0.6f)
    Row(modifier.height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.fillMaxHeight(), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                Modifier
                    .size(36.dp)
                    .background(colors.secondarySystemBackground, TileShape)
                    .border(1.dp, line, TileShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    painter = icon,
                    contentDescription = null,
                    tint = tint,
                    modifier = Modifier.size(iconSize)
                )
            }
            if (connects) {
                Box(
                    Modifier
                        .width(1.dp)
                        .heightIn(min = 14.dp)
                        .weight(1f)
                        .background(line)
                )
            }
        }
        Column(
            Modifier
                .weight(1f)
                .padding(bottom = if (connects) StepGap else 0.dp),
            verticalArrangement = Arrangement.spacedBy(1.dp)
        ) {
            Text(
                text = title,
                style = LpmTheme.typography.footnote.copy(lineHeight = 15.sp),
                color = colors.secondaryLabel
            )
            value()
        }
        Box(Modifier.raised(4.dp)) { change() }
    }
}

/** What a step does it to, in the body style. */
internal val TalkPlanValueStyle: TextStyle
    @Composable @ReadOnlyComposable
    get() = LpmTheme.typography.body.copy(lineHeight = 21.sp)

/** The words of a row's control, with room for a thumb around them. */
@Composable
internal fun TalkPlanRowLabel(
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true
) {
    Box(
        modifier.defaultMinSize(minWidth = 44.dp, minHeight = 44.dp),
        contentAlignment = Alignment.Center
    ) {
        LinkButton(text = title, onClick = onClick, enabled = enabled)
    }
}

/** SwiftUI's negative top padding: drawn [by] higher, and that much shorter in its row. */
private fun Modifier.raised(by: Dp): Modifier = layout { measurable, constraints ->
    val placeable = measurable.measure(constraints)
    val lift = by.roundToPx()
    layout(placeable.width, (placeable.height - lift).coerceAtLeast(0)) {
        placeable.place(0, -lift)
    }
}

private val TileShape = RoundedCornerShape(10.dp)

// SwiftUI sets a line of text as tall as its font, tighter than the type scale's line
// height, so the lines and this gap are the ones that put a step 51 dp under the last,
// as measured on the iPhone.
private val StepGap = 14.dp

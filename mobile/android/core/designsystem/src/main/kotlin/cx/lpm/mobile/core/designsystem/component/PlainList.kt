package cx.lpm.mobile.core.designsystem.component

import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp

/** Metrics of an iOS 26 `.listStyle(.plain)` list on iPhone. */
object PlainListDefaults {
    /** From the screen edge to a row's content, and to either end of a separator. */
    val RowPadding = 16.dp

    /** Above and below a row's content, inside the list's own row inset. */
    val RowInset = 13.dp

    /** Above the first row, below the bar or the search field in its drawer. */
    val TopInset = 10.dp
}

/**
 * A plain list's separator over a row's bottom edge, inset from both sides of the
 * screen; [top] draws one over its top edge too, as iOS 26 does above a list's first
 * row, and [bottom] off leaves the bottom one out (a row SwiftUI hides it beside).
 */
fun Modifier.plainListSeparator(
    color: Color,
    startInset: Dp = PlainListDefaults.RowPadding,
    endInset: Dp = PlainListDefaults.RowPadding,
    top: Boolean = false,
    bottom: Boolean = true
): Modifier = drawWithContent {
    drawContent()
    val thickness = ListDefaults.SeparatorThickness.toPx()
    val (left, right) = if (layoutDirection == LayoutDirection.Rtl) {
        endInset.toPx() to size.width - startInset.toPx()
    } else {
        startInset.toPx() to size.width - endInset.toPx()
    }
    if (bottom) {
        val y = size.height - thickness / 2
        drawLine(color, Offset(left, y), Offset(right, y), thickness)
    }
    if (top) drawLine(color, Offset(left, thickness / 2), Offset(right, thickness / 2), thickness)
}

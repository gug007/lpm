package cx.lpm.mobile.feature.git.history

import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import cx.lpm.mobile.core.designsystem.component.ListDefaults
import cx.lpm.mobile.core.designsystem.component.PlainListDefaults

/**
 * A plain list row's separators: under it unless [bottom] is off (a row SwiftUI hides
 * them beside), and over it too for the list's [top] row, starting at [startInset].
 */
internal fun Modifier.rowSeparators(
    color: Color,
    top: Boolean = false,
    bottom: Boolean = true,
    startInset: Dp = PlainListDefaults.RowPadding
): Modifier = drawWithContent {
    drawContent()
    val thickness = ListDefaults.SeparatorThickness.toPx()
    val end = PlainListDefaults.RowPadding.toPx()
    val (left, right) = if (layoutDirection == LayoutDirection.Rtl) {
        end to size.width - startInset.toPx()
    } else {
        startInset.toPx() to size.width - end
    }
    if (bottom) {
        val y = size.height - thickness / 2
        drawLine(color, Offset(left, y), Offset(right, y), thickness)
    }
    if (top) drawLine(color, Offset(left, thickness / 2), Offset(right, thickness / 2), thickness)
}

package cx.lpm.mobile.core.designsystem.component

import androidx.compose.foundation.Indication
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.layout
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp

private val MinTouchTarget = 48.dp

/**
 * Lets a control keep the size iOS draws it at in layout while its touch (and
 * accessibility) area grows to 48 dp: the inner half pads the content out to the
 * minimum, the outer half reports the content's own size to the parent.
 */
class TouchTarget {
    private var slopX = 0
    private var slopY = 0
    private var outer = Constraints()

    fun Modifier.wrap(interaction: Modifier): Modifier = this
        .layout { measurable, constraints ->
            outer = constraints
            val grow = MinTouchTarget.roundToPx() * 2
            val placeable = measurable.measure(
                constraints.copy(
                    maxWidth = constraints.maxWidth.grownBy(grow),
                    maxHeight = constraints.maxHeight.grownBy(grow)
                )
            )
            val width = (placeable.width - slopX * 2).coerceIn(
                constraints.minWidth,
                constraints.maxWidth
            )
            val height = (placeable.height - slopY * 2).coerceIn(
                constraints.minHeight,
                constraints.maxHeight
            )
            layout(width, height) { placeable.place(-slopX, -slopY) }
        }
        .then(interaction)
        .layout { measurable, _ ->
            val min = MinTouchTarget.roundToPx()
            val placeable = measurable.measure(outer)
            slopX = ((min - placeable.width) / 2).coerceAtLeast(0)
            slopY = ((min - placeable.height) / 2).coerceAtLeast(0)
            layout(placeable.width + slopX * 2, placeable.height + slopY * 2) {
                placeable.place(slopX, slopY)
            }
        }
}

/** A click whose touch area [target] grows to 48 dp, the content keeping its own size. */
fun Modifier.clickableTarget(
    target: TouchTarget,
    interactionSource: MutableInteractionSource,
    enabled: Boolean,
    role: Role,
    onClick: () -> Unit,
    indication: Indication? = null
): Modifier = with(target) {
    wrap(
        Modifier.clickable(
            interactionSource = interactionSource,
            indication = indication,
            enabled = enabled,
            role = role,
            onClick = onClick
        )
    )
}

internal fun Modifier.toggleableTarget(
    target: TouchTarget,
    value: Boolean,
    interactionSource: MutableInteractionSource,
    enabled: Boolean,
    onValueChange: (Boolean) -> Unit
): Modifier = with(target) {
    wrap(
        Modifier.toggleable(
            value = value,
            interactionSource = interactionSource,
            indication = null,
            enabled = enabled,
            role = Role.Switch,
            onValueChange = onValueChange
        )
    )
}

internal fun Modifier.selectableTarget(
    target: TouchTarget,
    selected: Boolean,
    interactionSource: MutableInteractionSource,
    onClick: () -> Unit
): Modifier = with(target) {
    wrap(
        Modifier.selectable(
            selected = selected,
            interactionSource = interactionSource,
            indication = null,
            role = Role.Tab,
            onClick = onClick
        )
    )
}

private fun Int.grownBy(amount: Int): Int {
    if (this == Constraints.Infinity) return this
    return this + amount
}

package cx.lpm.mobile.feature.terminal.composer

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.layout
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.clickableNoIndication
import cx.lpm.mobile.feature.terminal.R
import kotlin.math.roundToInt

internal const val FULL_MS = 200

/** The composer's height while it isn't raised. */
internal class RestingHeight {
    var value = 0
}

/**
 * Grows the composer up over what's above it, by [raise] of the room there, while it
 * keeps its resting height in the layout: a terminal that lost those rows would
 * reflow and resize on the computer.
 */
internal fun Modifier.raisedOverContent(resting: RestingHeight, raise: () -> Float): Modifier =
    layout { measurable, constraints ->
        val progress = raise()
        if (progress == 0f || !constraints.hasBoundedHeight) {
            val placeable = measurable.measure(constraints)
            resting.value = placeable.height
            layout(placeable.width, placeable.height) { placeable.place(0, 0) }
        } else {
            // Rotating can leave less room than it rested in.
            val rest = resting.value.coerceAtMost(constraints.maxHeight)
            val height = rest + ((constraints.maxHeight - rest) * progress).roundToInt()
            val placeable = measurable.measure(
                constraints.copy(minHeight = height, maxHeight = height)
            )
            layout(placeable.width, rest) { placeable.place(0, rest - height) }
        }
    }

/** In the field's top corner: opens a long prompt to the full page, and brings it back. */
@Composable
internal fun FullToggle(
    full: Boolean,
    color: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val label = stringResource(if (full) R.string.composer_collapse else R.string.composer_expand)
    val icon = if (full) DesignR.drawable.ic_keyboard_arrow_down else DesignR.drawable.ic_fullscreen
    Box(
        modifier
            .size(32.dp)
            .semantics { contentDescription = label }
            .clickableNoIndication(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            painter = painterResource(icon),
            contentDescription = null,
            tint = color.copy(alpha = ICON_ALPHA),
            modifier = Modifier.size(22.dp)
        )
    }
}

private const val ICON_ALPHA = 0.7f

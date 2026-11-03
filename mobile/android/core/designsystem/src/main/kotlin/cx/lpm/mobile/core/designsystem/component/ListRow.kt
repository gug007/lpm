package cx.lpm.mobile.core.designsystem.component

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.theme.LpmTheme

/**
 * A row of an inset-grouped list: iOS 26's 52 dp minimum height and 16 dp insets, an
 * optional [leading] icon or dot in a fixed column ([leadingSlot]) so titles line up,
 * the [content], and [trailing] at the far edge. With [onClick] the row highlights
 * while pressed, and [onLongClick] adds a long press. [indent] nests it (a project
 * inside a folder). The separator under it starts at the content.
 */
@Composable
fun ListRow(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    onLongClick: (() -> Unit)? = null,
    enabled: Boolean = true,
    leading: (@Composable () -> Unit)? = null,
    leadingSlot: ListLeadingSlot = ListDefaults.IconSlot,
    indent: Dp = 0.dp,
    verticalPadding: Dp = ListDefaults.RowVerticalPadding,
    trailing: (@Composable RowScope.() -> Unit)? = null,
    content: @Composable RowScope.() -> Unit
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val separatorInset = indent + if (leading != null) {
        ListDefaults.RowPadding + leadingSlot.width + leadingSlot.spacing
    } else {
        ListDefaults.RowPadding
    }
    Row(
        modifier = modifier
            .listSeparator(startInset = separatorInset)
            .fillMaxWidth()
            .then(
                when {
                    onClick == null -> Modifier

                    onLongClick != null -> Modifier.combinedClickable(
                        interactionSource = interaction,
                        indication = null,
                        enabled = enabled,
                        role = Role.Button,
                        onLongClick = onLongClick,
                        onClick = onClick
                    )

                    else -> Modifier.clickable(
                        interactionSource = interaction,
                        indication = null,
                        enabled = enabled,
                        role = Role.Button,
                        onClick = onClick
                    )
                }
            )
            .background(if (pressed) LpmTheme.colors.gray4 else Color.Transparent)
            .heightIn(min = ListDefaults.RowMinHeight)
            .padding(start = ListDefaults.RowPadding + indent, end = ListDefaults.RowPadding)
            .padding(vertical = verticalPadding),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (leading != null) {
            Box(Modifier.width(leadingSlot.width), contentAlignment = Alignment.Center) {
                leading()
            }
            Spacer(Modifier.width(leadingSlot.spacing))
        }
        Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, content = content)
        trailing?.invoke(this)
    }
}

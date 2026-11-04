package cx.lpm.mobile.core.designsystem.component

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.theme.LpmTheme

/** A row of large choices at the top of a [ContextMenu] (iOS's `ControlGroup` in a `Menu`). */
@Composable
fun ContextMenuTiles(modifier: Modifier = Modifier, content: @Composable RowScope.() -> Unit) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        content = content
    )
}

/** One of [ContextMenuTiles]: its icon over its title. Picking it closes the menu. */
@Composable
fun RowScope.ContextMenuTile(
    title: String,
    icon: Painter,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val controller = LocalContextMenuController.current
    Column(
        modifier = modifier
            .weight(1f)
            .clip(RoundedCornerShape(14.dp))
            .clickable(role = Role.Button) {
                controller?.dismiss()
                onClick()
            }
            .padding(vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Icon(
            painter = icon,
            contentDescription = null,
            tint = LpmTheme.colors.label,
            modifier = Modifier.size(24.dp)
        )
        Text(
            text = title,
            style = LpmTheme.typography.footnote,
            color = LpmTheme.colors.label,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

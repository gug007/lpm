package cx.lpm.mobile.feature.projects.newtab

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ListLeadingSlot
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.theme.LpmTheme

/**
 * One way a new tab can start (iOS `NewTabStartRow`): a terminal, or an agent ([agent]
 * its id) shown by its action's [emoji] or its own mark as the desktop shows it, checked
 * when picked. [accessory] follows the check.
 */
@Composable
internal fun NewTabStartRow(
    label: String,
    agent: String?,
    picked: Boolean,
    onPick: () -> Unit,
    modifier: Modifier = Modifier,
    emoji: String = "",
    accessory: (@Composable () -> Unit)? = null
) {
    val colors = LpmTheme.colors
    ListRow(
        modifier = modifier.semantics { selected = picked },
        onClick = onPick,
        leading = {
            Box(Modifier.size(28.dp), contentAlignment = Alignment.Center) {
                LaunchpadMark(agent = agent, emoji = emoji)
            }
        },
        leadingSlot = MarkSlot,
        trailing = {
            if (picked) {
                Icon(
                    painter = painterResource(DesignR.drawable.ic_check),
                    contentDescription = null,
                    tint = colors.tint,
                    modifier = Modifier.size(22.dp)
                )
            }
            accessory?.invoke()
        }
    ) {
        Text(text = label, style = LpmTheme.typography.body, color = colors.label)
    }
}

private val MarkSlot = ListLeadingSlot(width = 28.dp, spacing = 12.dp)

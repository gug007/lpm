package cx.lpm.mobile.feature.projects.newtab

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ContextMenu
import cx.lpm.mobile.core.designsystem.component.ContextMenuItem
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.LaunchpadOption
import cx.lpm.mobile.core.model.LaunchpadTab
import cx.lpm.mobile.feature.projects.R

/**
 * A header split button or menu in the New Tab sheet's Start list (iOS `NewTabGroupRow`),
 * picked as the desktop's empty project picks it: the row picks the item the split leads
 * with (the picked one, when it holds it) and the chevron lists every item; a menu with
 * nothing to lead with opens its items from the whole row.
 */
@Composable
internal fun NewTabGroupRow(
    tab: LaunchpadTab,
    picked: String,
    onPick: (LaunchpadOption) -> Unit,
    modifier: Modifier = Modifier
) {
    var open by remember { mutableStateOf(false) }
    val current = tab.options.firstOrNull { it.id == picked }
    val lead = tab.primary?.let { current ?: it }
    val pickFrom = stringResource(R.string.new_tab_pick_from, tab.label)
    NewTabStartRow(
        label = lead?.label ?: current?.label ?: tab.label,
        agent = (lead ?: current ?: tab.options.first()).agent,
        emoji = (lead ?: current)?.emoji ?: tab.emoji,
        picked = current != null,
        onPick = { if (lead != null) onPick(lead) else open = true },
        modifier = modifier,
        accessory = {
            val chevron = Modifier.size(width = 32.dp, height = 44.dp)
            Box(
                modifier = lead?.let {
                    chevron.clickable(onClickLabel = pickFrom, role = Role.Button) { open = true }
                } ?: chevron,
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    painter = painterResource(DesignR.drawable.ic_unfold_more),
                    contentDescription = if (lead != null) pickFrom else null,
                    tint = LpmTheme.colors.secondaryLabel,
                    modifier = Modifier.size(18.dp)
                )
                ContextMenu(expanded = open, onDismissRequest = { open = false }) {
                    val check = painterResource(DesignR.drawable.ic_check)
                    tab.options.forEach { option ->
                        ContextMenuItem(
                            title = option.menuTitle,
                            onClick = { onPick(option) },
                            icon = check.takeIf { option.id == picked }
                        )
                    }
                }
            }
        }
    )
}

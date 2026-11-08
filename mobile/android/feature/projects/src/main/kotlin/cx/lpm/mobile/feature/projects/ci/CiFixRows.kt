package cx.lpm.mobile.feature.projects.ci

import androidx.annotation.StringRes
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
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
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.LaunchpadOption
import cx.lpm.mobile.core.model.LaunchpadTab
import cx.lpm.mobile.feature.projects.R
import cx.lpm.mobile.feature.projects.newtab.LaunchpadMark

/**
 * The checks sheet's "Fix with …" rows (iOS `CiFixRows`), as the desktop's checks menu
 * lists them: every agent the project's New Tab sheet offers. A header split button or
 * menu is one row: a split's row runs the item its button leads with and its chevron
 * lists every item; a menu's whole row lists them. [detail] says what a row opens, under
 * it when it's the only way to fix.
 */
@Composable
internal fun CiFixRows(
    tabs: List<LaunchpadTab>,
    onFix: (LaunchpadOption) -> Unit,
    @StringRes detail: Int = R.string.ci_fix_description
) {
    val only = tabs.size == 1 && tabs[0].options.size == 1
    tabs.forEach { tab ->
        if (tab.options.size > 1) {
            CiFixGroupRow(tab, onFix)
        } else {
            val option = tab.options.first()
            CiFixRow(option.label, option.agent, option.emoji, detail.takeIf { only }, onClick = {
                onFix(option)
            })
        }
    }
}

@Composable
private fun CiFixGroupRow(tab: LaunchpadTab, onFix: (LaunchpadOption) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val lead = tab.primary
    val pickFrom = stringResource(R.string.new_tab_pick_from, tab.label)
    CiFixRow(
        label = lead?.label ?: tab.label,
        agent = (lead ?: tab.options.first()).agent,
        emoji = lead?.emoji ?: tab.emoji,
        detail = null,
        onClick = { if (lead != null) onFix(lead) else open = true },
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
                    tab.options.forEach { option ->
                        ContextMenuItem(title = option.menuTitle, onClick = {
                            open = false
                            onFix(option)
                        })
                    }
                }
            }
        }
    )
}

/** A fix row's face: its mark beside what it does. */
@Composable
private fun CiFixRow(
    label: String,
    agent: String,
    emoji: String,
    @StringRes detail: Int?,
    onClick: () -> Unit,
    accessory: (@Composable () -> Unit)? = null
) {
    val colors = LpmTheme.colors
    ListRow(
        onClick = onClick,
        leading = { LaunchpadMark(agent = agent, emoji = emoji) },
        trailing = accessory?.let { { it() } }
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                stringResource(R.string.ci_fix, label),
                style = LpmTheme.typography.body,
                color = colors.tint
            )
            if (detail != null) {
                Text(
                    stringResource(detail),
                    style = LpmTheme.typography.caption1,
                    color = colors.secondaryLabel
                )
            }
        }
    }
}

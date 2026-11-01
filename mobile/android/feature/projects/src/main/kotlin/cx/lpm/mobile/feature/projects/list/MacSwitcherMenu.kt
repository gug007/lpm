package cx.lpm.mobile.feature.projects.list

import android.text.format.DateUtils
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import cx.lpm.mobile.core.data.link.MacReach
import cx.lpm.mobile.core.designsystem.R
import cx.lpm.mobile.core.designsystem.component.ContextMenu
import cx.lpm.mobile.core.designsystem.component.ContextMenuDivider
import cx.lpm.mobile.core.designsystem.component.ContextMenuItem
import cx.lpm.mobile.feature.projects.R as ProjectsR

/** What the title's Mac picker does; [pendingMachines] are the machines feature's rows. */
@Immutable
class MacSwitcherActions(
    val exitDemo: () -> Unit = {},
    val switchTo: (macId: String) -> Unit = {},
    val addMachine: () -> Unit = {},
    val manageMachines: () -> Unit = {},
    val showDetails: () -> Unit = {},
    val setShowAllMachines: (Boolean) -> Unit = {},
    val pendingMachines: @Composable ColumnScope.() -> Unit = {},
    val keepAwake: @Composable ColumnScope.() -> Unit = {},
    val keepAwakeIndicator: @Composable () -> Unit = {}
)

/**
 * The title's menu for choosing which saved Mac is live: every saved Mac with
 * whether it answers right now (a check on the active one), Keep Awake, then "Show All
 * Machines" once another machine is paired here ([showAllMachines] not null), "Add a
 * machine…" and "Manage machines…". In Demo Mode it only offers Keep Awake and the way out.
 */
@Composable
fun MacSwitcherMenu(
    expanded: Boolean,
    onDismiss: () -> Unit,
    macs: List<MacChoice>,
    demoMode: Boolean,
    actions: MacSwitcherActions,
    modifier: Modifier = Modifier,
    showAllMachines: Boolean? = null
) {
    ContextMenu(expanded = expanded, onDismissRequest = onDismiss, modifier = modifier) {
        if (demoMode) {
            actions.keepAwake(this)
            ContextMenuItem(
                title = stringResource(ProjectsR.string.mac_exit_demo),
                onClick = actions.exitDemo,
                icon = painterResource(R.drawable.ic_cancel)
            )
        } else {
            macs.forEach { mac ->
                ContextMenuItem(
                    title = mac.name,
                    subtitle = macStatusText(mac.status),
                    onClick = { actions.switchTo(mac.id) },
                    icon = painterResource(
                        when {
                            mac.active -> R.drawable.ic_check
                            mac.linuxHost -> R.drawable.ic_dns
                            else -> R.drawable.ic_desktop_mac
                        }
                    )
                )
            }
            actions.pendingMachines(this)
            actions.keepAwake(this)
            ContextMenuDivider()
            if (showAllMachines != null) {
                ContextMenuItem(
                    title = stringResource(ProjectsR.string.mac_show_all),
                    onClick = { actions.setShowAllMachines(!showAllMachines) },
                    icon = painterResource(
                        if (showAllMachines) R.drawable.ic_check else R.drawable.ic_stacks
                    ),
                    iconDescription = stringResource(ProjectsR.string.auto_pull_selected)
                        .takeIf { showAllMachines }
                )
            }
            ContextMenuItem(
                title = stringResource(ProjectsR.string.mac_add),
                onClick = actions.addMachine,
                icon = painterResource(R.drawable.ic_add)
            )
            ContextMenuItem(
                title = stringResource(ProjectsR.string.mac_manage),
                onClick = actions.manageMachines,
                icon = painterResource(R.drawable.ic_tune)
            )
        }
    }
}

/**
 * Whether a saved machine is reachable: the live one's own status, and for the
 * others the last check, so switching isn't a guess.
 */
@Composable
private fun macStatusText(status: MacStatus): String = when (status) {
    is MacStatus.Live -> status.text

    is MacStatus.Reach -> when (status.reach) {
        MacReach.Online -> stringResource(ProjectsR.string.mac_online)

        MacReach.Checking -> stringResource(ProjectsR.string.mac_checking)

        else -> status.lastConnected?.let {
            val ago = DateUtils.getRelativeTimeSpanString(
                it.toEpochMilli(),
                System.currentTimeMillis(),
                DateUtils.MINUTE_IN_MILLIS
            )
            stringResource(ProjectsR.string.mac_last_connected, ago)
        } ?: stringResource(ProjectsR.string.mac_not_answering)
    }
}

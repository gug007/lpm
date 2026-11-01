package cx.lpm.mobile.feature.mac.keepawake

import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ContextMenuDivider
import cx.lpm.mobile.core.designsystem.component.ContextMenuItem
import cx.lpm.mobile.core.designsystem.component.ContextMenuSectionHeader
import cx.lpm.mobile.core.designsystem.component.ContextMenuSubmenu
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.MacKeepAwake
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.feature.mac.R
import java.time.Instant
import java.time.ZoneId

/** Keep Awake in the Mac menu, for the live Mac. */
@Composable
fun KeepAwakeMenuRoute() {
    val viewModel = keepAwakeViewModel(SessionKey.Live)
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    KeepAwakeMenu(state, onSet = viewModel::set)
}

/**
 * Keep Awake in the Mac menu: the state now, and the quick choices. A custom time
 * lives in the connection details (iOS `KeepAwakeMenu`).
 */
@Composable
fun KeepAwakeMenu(state: KeepAwakeUiState, onSet: (MacKeepAwake.Mode, Int?) -> Unit) {
    val keepAwake = state.offered ?: return
    val now = Instant.now()
    val left = state.keepAwake.leftSeconds(now)
    ContextMenuSubmenu(
        title = stringResource(R.string.keep_awake_menu),
        icon = painterResource(
            if (keepAwake.isOn) DesignR.drawable.ic_coffee_fill else DesignR.drawable.ic_coffee
        ),
        subtitle = keepAwake.badge(left)
    ) {
        ContextMenuSectionHeader(keepAwake.line(left, now, ZoneId.systemDefault()))
        Choice(
            stringResource(R.string.keep_awake_menu_agents),
            keepAwake.mode == MacKeepAwake.Mode.Agents
        ) {
            onSet(MacKeepAwake.Mode.Agents, null)
        }
        MacKeepAwake.PRESETS.forEach { minutes ->
            ContextMenuItem(title = MacKeepAwake.presetTitle(minutes), onClick = {
                onSet(MacKeepAwake.Mode.Timed, minutes)
            })
        }
        Choice(
            stringResource(R.string.keep_awake_menu_always),
            keepAwake.mode == MacKeepAwake.Mode.Always
        ) {
            onSet(MacKeepAwake.Mode.Always, null)
        }
        ContextMenuDivider()
        Choice(
            stringResource(R.string.keep_awake_off),
            keepAwake.mode == MacKeepAwake.Mode.Off
        ) {
            onSet(MacKeepAwake.Mode.Off, null)
        }
    }
}

@Composable
private fun Choice(title: String, checked: Boolean, onClick: () -> Unit) {
    ContextMenuItem(
        title = title,
        onClick = onClick,
        icon = if (checked) painterResource(DesignR.drawable.ic_check) else null,
        iconDescription = if (checked) stringResource(R.string.keep_awake_selected) else null
    )
}

/** The cup beside the live Mac's name while it is kept awake. */
@Composable
fun KeepAwakeIndicatorRoute(modifier: Modifier = Modifier) {
    val viewModel = keepAwakeViewModel(SessionKey.Live)
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    if (state.offered?.isOn != true) return
    Icon(
        painter = painterResource(DesignR.drawable.ic_coffee_fill),
        contentDescription = stringResource(R.string.keep_awake_kept),
        tint = LpmTheme.colors.orange,
        modifier = modifier.size(14.dp)
    )
}

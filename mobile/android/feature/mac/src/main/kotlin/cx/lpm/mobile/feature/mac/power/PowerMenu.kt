package cx.lpm.mobile.feature.mac.power

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
import cx.lpm.mobile.core.designsystem.component.AlertButton
import cx.lpm.mobile.core.designsystem.component.AlertRole
import cx.lpm.mobile.core.designsystem.component.ContextMenuItem
import cx.lpm.mobile.core.designsystem.component.ContextMenuSubmenu
import cx.lpm.mobile.core.designsystem.component.LpmConfirmationDialog
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.MacPower
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.feature.mac.R

/** Lock or Sleep in the Mac menu, for the live Mac. */
@Composable
fun PowerMenuRoute() {
    val viewModel = powerViewModel(SessionKey.Live)
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val power = state.power.power?.takeIf { it.offered } ?: return
    PowerMenu(
        power,
        onLock = viewModel::lock,
        onSleep = viewModel::askToSleep,
        onSleepWhenIdle = viewModel::sleepWhenIdle
    )
}

/**
 * Lock or Sleep in the Mac menu: lock its screen, put it to sleep now, or let it sleep
 * once its agents and automations finish (iOS `PowerMenu`).
 */
@Composable
fun PowerMenu(
    power: MacPower,
    onLock: () -> Unit,
    onSleep: () -> Unit,
    onSleepWhenIdle: (Boolean) -> Unit
) {
    ContextMenuSubmenu(
        title = stringResource(R.string.power_menu),
        icon = painterResource(
            if (power.armed) DesignR.drawable.ic_bedtime_fill else DesignR.drawable.ic_bedtime
        ),
        subtitle = if (power.armed) stringResource(R.string.power_armed) else null
    ) {
        if (power.canLock) {
            ContextMenuItem(
                title = stringResource(R.string.power_lock),
                onClick = onLock,
                icon = painterResource(DesignR.drawable.ic_lock)
            )
        }
        if (power.canSleep) {
            ContextMenuItem(
                title = stringResource(R.string.power_sleep_now),
                onClick = onSleep,
                icon = painterResource(DesignR.drawable.ic_dark_mode)
            )
            ContextMenuItem(
                title = stringResource(R.string.power_sleep_when_idle),
                subtitle = if (power.armed) {
                    stringResource(R.string.power_sleep_when_idle_on)
                } else {
                    power.workingLine
                },
                onClick = { onSleepWhenIdle(!power.armed) },
                icon = painterResource(
                    if (power.armed) DesignR.drawable.ic_check else DesignR.drawable.ic_bedtime
                ),
                iconDescription = if (power.armed) {
                    stringResource(
                        R.string.keep_awake_selected
                    )
                } else {
                    null
                },
                enabled = power.armed || power.working
            )
        }
    }
}

/**
 * The moon beside the live Mac's name while it sleeps once its agents finish, and the
 * question Sleep Now asks first: the menu closes as it's picked, so it lives here.
 */
@Composable
fun PowerIndicatorRoute(modifier: Modifier = Modifier) {
    val viewModel = powerViewModel(SessionKey.Live)
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    if (state.power.confirmingSleep) {
        SleepConfirmation(
            macLabel = state.macLabel,
            onSleep = viewModel::sleepNow,
            onDismiss = viewModel::cancelSleep
        )
    }
    if (state.power.power?.armed != true) return
    Icon(
        painter = painterResource(DesignR.drawable.ic_bedtime_fill),
        contentDescription = stringResource(R.string.power_armed),
        tint = LpmTheme.colors.indigo,
        modifier = modifier.size(14.dp)
    )
}

@Composable
private fun SleepConfirmation(macLabel: String, onSleep: () -> Unit, onDismiss: () -> Unit) {
    LpmConfirmationDialog(
        title = stringResource(R.string.power_sleep_confirm_title, macLabel),
        message = stringResource(R.string.power_sleep_confirm_message),
        buttons = listOf(
            AlertButton(stringResource(R.string.power_sleep_now), onClick = onSleep),
            AlertButton(stringResource(R.string.power_cancel), AlertRole.Cancel)
        ),
        onDismissRequest = onDismiss
    )
}

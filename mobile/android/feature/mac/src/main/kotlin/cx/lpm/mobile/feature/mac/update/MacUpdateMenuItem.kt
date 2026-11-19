package cx.lpm.mobile.feature.mac.update

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ContextMenuItem
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.feature.mac.R

/** "Check for lpm Updates…" in the projects "…" menu, when the live Mac can update. */
@Composable
fun MacUpdateMenuItemRoute() {
    val viewModel = macUpdateViewModel(SessionKey.Live)
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    MacUpdateMenuItem(state, onCheck = viewModel::checkNow)
}

@Composable
fun MacUpdateMenuItem(state: MacUpdateUiState, onCheck: () -> Unit) {
    if (!state.update.canUpdate) return
    ContextMenuItem(
        title = stringResource(R.string.mac_update_check_now),
        onClick = onCheck,
        icon = painterResource(DesignR.drawable.ic_arrow_circle_down),
        enabled = state.canCheckNow
    )
}

/** The version of lpm the live Mac runs; null until it says. */
@Composable
fun liveMacVersion(): String? {
    val state by macUpdateViewModel(SessionKey.Live).uiState.collectAsStateWithLifecycle()
    return state.update.version
}

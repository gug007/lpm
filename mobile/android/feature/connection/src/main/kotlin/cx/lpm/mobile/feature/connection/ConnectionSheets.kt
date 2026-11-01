package cx.lpm.mobile.feature.connection

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.component.ModalSheet
import cx.lpm.mobile.core.designsystem.component.rememberModalSheetState
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.navigation.PresentationScope

/**
 * The sheets the connection UI opens from anywhere in the app (iOS
 * `ConnectionSheets`): details behind the status line, the identity check, the
 * machine list, Built-in Tailscale and its sign-in page, and the check after
 * pairing. An action that swaps one sheet for another runs once the first has
 * gone. The app puts this over both roots; [macUpdateSection] is the Mac update
 * section the connection sheet shows, from the feature that owns it.
 */
@Composable
fun ConnectionSheets(
    session: SessionKey = SessionKey.Live,
    macUpdateSection: @Composable () -> Unit = {},
    keepAwakeSection: @Composable (openCustomTime: () -> Unit) -> Unit = {},
    keepAwakeCustomTime: @Composable (onDone: () -> Unit) -> Unit = {}
) {
    val viewModel = hiltViewModel<ConnectionSheetsViewModel, ConnectionSheetsViewModel.Factory>(
        key = "sheets-$session"
    ) { it.create(session) }
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    if (state.details) {
        PresentationScope {
            ConnectionSheet(
                session,
                onDismiss = { viewModel.closed { it.copy(sheetOpen = false) } },
                macUpdateSection = macUpdateSection,
                keepAwakeSection = keepAwakeSection,
                keepAwakeCustomTime = keepAwakeCustomTime
            )
        }
    }
    if (state.identityCheck) {
        PresentationScope {
            IdentityCheckSheet(session, onDismiss = {
                viewModel.closed { it.copy(identityCheckOpen = false) }
            })
        }
    }
    if (state.machines) {
        ManageMacsSheet(onDismiss = { viewModel.closed { it.copy(manageOpen = false) } })
    }
    if (state.tailscaleSettings) {
        TailnetSettingsSheet(onDismiss = viewModel::closeTailscaleSettings)
    }
    state.summary?.let { summary ->
        PresentationScope { PairedSummarySheet(summary, onDismiss = viewModel::closeSummary) }
    }
    LaunchedEffect(state.tailscalePage) {
        state.tailscalePage?.let {
            context.openInApp(it)
            viewModel.tailscalePageShown()
        }
    }
}

/** Built-in Tailscale as a sheet of its own, closed with Done. */
@Composable
internal fun TailnetSettingsSheet(onDismiss: () -> Unit) {
    val sheet = rememberModalSheetState()
    ModalSheet(onDismissRequest = onDismiss, state = sheet) {
        PresentationScope { TailnetSettingsPage(onDone = { sheet.dismiss(onDismiss) }) }
    }
}

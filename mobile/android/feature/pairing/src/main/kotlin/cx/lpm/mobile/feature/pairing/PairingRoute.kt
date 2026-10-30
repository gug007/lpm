package cx.lpm.mobile.feature.pairing

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.core.net.toUri
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleStartEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.component.AlertButton
import cx.lpm.mobile.core.designsystem.component.AlertRole
import cx.lpm.mobile.core.designsystem.component.LpmAlert
import cx.lpm.mobile.core.ui.LocalNetworkAccess
import cx.lpm.mobile.core.ui.rememberLocalNetworkAccess

/**
 * The pairing screen with its ViewModel, sheets and alerts. [adding] when it's "Add
 * a machine" over the projects list; [onEnterCode] opens Enter a Code wherever this
 * screen lives.
 */
@Composable
fun PairingRoute(
    onEnterCode: (CodeTarget) -> Unit,
    issueCard: IssueCardSlot,
    modifier: Modifier = Modifier,
    adding: Boolean = false,
    viewModel: PairingViewModel =
        hiltViewModel<PairingViewModel, PairingViewModel.Factory>(key = "pairing-$adding") {
            it.create(adding)
        }
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    LifecycleStartEffect(viewModel) {
        viewModel.startDiscovery()
        onStopOrDispose { viewModel.stopDiscovery() }
    }
    // Android 17 asks before the phone may look on this Wi-Fi (iOS asks by itself as
    // it starts looking); browsing starts over once it's allowed.
    val (localNetwork, askLocalNetwork) = rememberLocalNetworkAccess()
    LaunchedEffect(localNetwork) {
        when (localNetwork) {
            LocalNetworkAccess.NotDetermined -> askLocalNetwork()
            LocalNetworkAccess.Allowed -> viewModel.startDiscovery()
            LocalNetworkAccess.Denied -> Unit
        }
    }
    val enterCode by rememberUpdatedState(onEnterCode)
    LaunchedEffect(state.codeTarget) {
        state.codeTarget?.let {
            viewModel.codeTargetShown()
            enterCode(it)
        }
    }
    val actions = remember(viewModel) {
        PairingActions(
            onSetUpTailscale = viewModel::setUpTailscale,
            onUseTailscaleApp = viewModel::useTailscaleApp,
            onUseBuiltIn = viewModel::useBuiltInInstead,
            onLocalOnly = viewModel::pairLocalOnly,
            onPickNearby = viewModel::selectNearby,
            onOpenSettings = {
                context.startActivity(
                    Intent(
                        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.fromParts("package", context.packageName, null)
                    )
                )
            },
            onScan = viewModel::startScan,
            onEnterCode = { viewModel.enterCode() },
            onIssueAction = viewModel::handle,
            onWatchVideo = {
                context.startActivity(Intent(Intent.ACTION_VIEW, SETUP_VIDEO_URL.toUri()))
            },
            onTryDemo = viewModel::enterDemo
        )
    }
    PairingScreen(state = state, actions = actions, issueCard = issueCard, modifier = modifier)
    if (state.scanning) {
        QrScannerSheet(
            onScan = viewModel::scanned,
            onDismiss = viewModel::scanClosed
        )
    }
    state.approval?.let { approval ->
        ApprovalPairingSheet(
            approval = approval,
            macName = state.approvalMacName,
            onCancel = viewModel::cancelApproval,
            onRetry = viewModel::retryApproval,
            onEnterCode = viewModel::enterCodeInstead
        )
    }
    if (state.heldScan != null) {
        LpmAlert(
            title = stringResource(R.string.held_scan_title),
            message = stringResource(R.string.held_scan_message),
            buttons = listOf(
                AlertButton(
                    stringResource(R.string.held_scan_pair),
                    onClick = viewModel::pairHeldScan
                ),
                AlertButton(
                    stringResource(R.string.not_now),
                    AlertRole.Cancel,
                    onClick = viewModel::dropHeldScan
                )
            ),
            onDismissRequest = {}
        )
    }
    state.unreachable?.let { mac ->
        LpmAlert(
            title = stringResource(
                R.string.unreachable_title,
                mac.displayName.ifEmpty {
                    stringResource(R.string.this_mac)
                }
            ),
            message = stringResource(R.string.unreachable_message),
            buttons = listOf(
                AlertButton(stringResource(R.string.try_again_title)) {
                    viewModel.selectNearby(mac)
                },
                AlertButton(stringResource(R.string.unreachable_enter_code)) {
                    viewModel.dismissUnreachable()
                    viewModel.enterCode()
                },
                AlertButton(
                    stringResource(R.string.cancel),
                    AlertRole.Cancel,
                    onClick = viewModel::dismissUnreachable
                )
            ),
            onDismissRequest = {}
        )
    }
}

private const val SETUP_VIDEO_URL = "https://www.youtube.com/watch?v=6tiTDB6XynM"

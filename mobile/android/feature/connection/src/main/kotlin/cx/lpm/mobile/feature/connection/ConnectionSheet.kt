package cx.lpm.mobile.feature.connection

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.component.AlertButton
import cx.lpm.mobile.core.designsystem.component.AlertRole
import cx.lpm.mobile.core.designsystem.component.AlertTextField
import cx.lpm.mobile.core.designsystem.component.LpmAlert
import cx.lpm.mobile.core.designsystem.component.ModalSheet
import cx.lpm.mobile.core.designsystem.component.rememberModalSheetState
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.navigation.SheetStack
import cx.lpm.mobile.core.navigation.rememberSheetNavigator

/** The pages of the connection sheet. */
internal sealed interface ConnectionPage {
    data object Root : ConnectionPage

    data object Tailscale : ConnectionPage

    data class Addresses(val macId: String) : ConnectionPage

    data object KeepAwakeTime : ConnectionPage
}

/**
 * Behind the status line: how the phone reaches the active Mac, each saved address
 * and whether it answers, the problem and its fix when there is one, and every
 * action on the Mac itself.
 */
@Composable
internal fun ConnectionSheet(
    session: SessionKey,
    onDismiss: () -> Unit,
    macUpdateSection: @Composable () -> Unit,
    keepAwakeSection: @Composable (openCustomTime: () -> Unit) -> Unit = {},
    keepAwakeCustomTime: @Composable (onDone: () -> Unit) -> Unit = {}
) {
    val sheet = rememberModalSheetState()
    val close = { sheet.dismiss(onDismiss) }
    val navigator = rememberSheetNavigator<ConnectionPage>(ConnectionPage.Root)
    ModalSheet(onDismissRequest = onDismiss, state = sheet) {
        SheetStack(navigator) { page ->
            when (page) {
                ConnectionPage.Root -> ConnectionRoot(
                    session = session,
                    onDone = close,
                    onDismiss = onDismiss,
                    onOpen = navigator::push,
                    macUpdateSection = macUpdateSection,
                    keepAwakeSection = {
                        keepAwakeSection { navigator.push(ConnectionPage.KeepAwakeTime) }
                    }
                )

                ConnectionPage.Tailscale -> TailnetSettingsPage(onBack = navigator::back)

                ConnectionPage.KeepAwakeTime -> SheetPage(
                    title = stringResource(R.string.keep_awake_custom_title),
                    onBack = navigator::back
                ) {
                    SheetForm { keepAwakeCustomTime(navigator::back) }
                }

                is ConnectionPage.Addresses -> EditEndpointPage(
                    macId = page.macId,
                    session = session,
                    onBack = navigator::back
                )
            }
        }
    }
}

@Composable
private fun ConnectionRoot(
    session: SessionKey,
    onDone: () -> Unit,
    onDismiss: () -> Unit,
    onOpen: (ConnectionPage) -> Unit,
    macUpdateSection: @Composable () -> Unit,
    keepAwakeSection: @Composable () -> Unit,
    viewModel: ConnectionSheetViewModel =
        hiltViewModel<ConnectionSheetViewModel, ConnectionSheetViewModel.Factory>(
            key = "connection-$session"
        ) {
            it.create(session)
        }
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var renaming by remember { mutableStateOf<String?>(null) }
    var removing by remember { mutableStateOf(false) }
    LaunchedEffect(viewModel) { viewModel.testAll() }
    SheetPage(title = stringResource(R.string.connection_title), trailing = {
        DoneButton(onDone)
    }) {
        ConnectionDetails(
            state = state,
            onIssueAction = { action, issue ->
                if (ConnectionSheetViewModel.opensSheet(action)) {
                    viewModel.performAfterClose(action, issue)
                    onDone()
                } else {
                    context.performIssueAction(action, issue, viewModel::perform)
                }
            },
            onTestAgain = viewModel::testAll,
            onOpen = onOpen,
            onRename = { renaming = state.record?.displayName.orEmpty() },
            onPairAgain = {
                viewModel.pairAgainAfterClose()
                onDone()
            },
            onRemove = { removing = true },
            macUpdateSection = macUpdateSection,
            keepAwakeSection = keepAwakeSection
        )
    }
    renaming?.let { text ->
        LpmAlert(
            title = stringResource(R.string.rename),
            message = stringResource(R.string.rename_message),
            textField = { AlertTextField(text, { renaming = it }, stringResource(R.string.name)) },
            buttons = listOf(
                AlertButton(stringResource(R.string.cancel), AlertRole.Cancel),
                AlertButton(stringResource(R.string.save)) {
                    state.record?.let { viewModel.rename(it.localId, text) }
                }
            ),
            onDismissRequest = { renaming = null }
        )
    }
    if (removing) {
        LpmAlert(
            title = removeTitle(state),
            message = removeMessage(state),
            buttons = listOf(
                AlertButton(stringResource(R.string.remove), AlertRole.Destructive) {
                    val id = state.record?.localId ?: return@AlertButton
                    onDismiss()
                    viewModel.remove(id)
                },
                AlertButton(stringResource(R.string.cancel), AlertRole.Cancel)
            ),
            onDismissRequest = { removing = false }
        )
    }
}

@Composable
private fun removeTitle(state: ConnectionSheetUiState): String {
    val record = state.record
    if (record == null || record.isAddressName) return stringResource(R.string.remove_this_mac)
    return stringResource(R.string.remove_named, record.displayName)
}

@Composable
private fun removeMessage(state: ConnectionSheetUiState): String {
    val next = state.nextAfterRemoval?.let {
        stringResource(R.string.remove_next, it.displayName)
    }.orEmpty()
    val via = state.via
    if (via != null) return stringResource(R.string.remove_via_message, via.displayName, next)
    return stringResource(R.string.mac_remove_message, next)
}

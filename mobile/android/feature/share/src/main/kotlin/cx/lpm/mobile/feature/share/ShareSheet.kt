package cx.lpm.mobile.feature.share

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.AlertButton
import cx.lpm.mobile.core.designsystem.component.AlertRole
import cx.lpm.mobile.core.designsystem.component.EmptyState
import cx.lpm.mobile.core.designsystem.component.GlassCapsuleButton
import cx.lpm.mobile.core.designsystem.component.ListDefaults
import cx.lpm.mobile.core.designsystem.component.ListHeaderStyle
import cx.lpm.mobile.core.designsystem.component.ListSection
import cx.lpm.mobile.core.designsystem.component.LpmAlert
import cx.lpm.mobile.core.designsystem.component.LpmTopBar
import cx.lpm.mobile.core.designsystem.component.ModalSheet
import cx.lpm.mobile.core.designsystem.component.PickerRow
import cx.lpm.mobile.core.designsystem.component.TextFieldRow
import cx.lpm.mobile.core.designsystem.component.rememberModalSheetState
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.ShareDestination
import kotlinx.coroutines.delay

/** What the sheet's controls do. */
@Immutable
data class ShareActions(
    val note: (String) -> Unit = {},
    val mac: (String) -> Unit = {},
    val project: (String) -> Unit = {},
    val destination: (ShareDestination) -> Unit = {},
    val agent: (String) -> Unit = {},
    val send: () -> Unit = {},
    val dismissFailure: () -> Unit = {},
    /** The sheet closed without sending. */
    val cancel: () -> Unit = {},
    /** The sheet closed once the share was sent or kept for later. */
    val done: () -> Unit = {}
)

/**
 * "Send to lpm" (iOS `ShareView`): what was shared, a note to go with it, the project,
 * and whether it starts a new agent tab or goes into the project's notes.
 */
@Composable
fun ShareSheet(state: ShareUiState, actions: ShareActions, modifier: Modifier = Modifier) {
    val sheet = rememberModalSheetState()
    LaunchedEffect(state.phase) {
        if (state.phase != SharePhase.Sent) return@LaunchedEffect
        delay(SENT_CLOSE_MS)
        sheet.dismiss(actions.done)
    }
    ModalSheet(onDismissRequest = actions.cancel, modifier = modifier, state = sheet) {
        Box(Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize()) {
                ShareBar(state, onCancel = { sheet.dismiss(actions.cancel) }, onSend = actions.send)
                when {
                    state.directory == null -> Unit

                    state.macs.isEmpty() -> Box(
                        Modifier
                            .fillMaxWidth()
                            .weight(1f),
                        contentAlignment = Alignment.Center
                    ) {
                        EmptyState(
                            title = stringResource(R.string.share_empty_title),
                            icon = painterResource(DesignR.drawable.ic_devices),
                            description = stringResource(R.string.share_empty_message)
                        )
                    }

                    else -> ShareForm(state, actions)
                }
            }
            ShareProgressCard(state, onDone = { sheet.dismiss(actions.done) })
        }
    }
    val failure = when (val phase = state.phase) {
        is SharePhase.Failed -> phase.message

        SharePhase.NotKept -> stringResource(
            R.string.share_not_kept,
            state.mac?.name ?: stringResource(R.string.share_your_mac)
        )

        else -> null
    }
    if (failure != null) {
        LpmAlert(
            title = stringResource(R.string.share_failed),
            message = failure,
            buttons = listOf(
                AlertButton(
                    stringResource(R.string.share_ok),
                    AlertRole.Cancel,
                    onClick = actions.dismissFailure
                )
            ),
            onDismissRequest = actions.dismissFailure
        )
    }
}

@Composable
private fun ShareBar(state: ShareUiState, onCancel: () -> Unit, onSend: () -> Unit) {
    LpmTopBar(
        title = stringResource(R.string.share_title),
        modifier = Modifier.padding(top = 16.dp),
        windowInsets = WindowInsets(0),
        leading = {
            GlassCapsuleButton(text = stringResource(R.string.share_cancel), onClick = onCancel)
        },
        trailing = if (state.macs.isEmpty()) {
            null
        } else {
            {
                GlassCapsuleButton(
                    text = stringResource(R.string.share_send),
                    onClick = onSend,
                    enabled = state.canSend,
                    textStyle = LpmTheme.typography.headline
                )
            }
        }
    )
}

@Composable
private fun ShareForm(state: ShareUiState, actions: ShareActions) {
    Column(
        Modifier
            .fillMaxWidth()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(top = ListDefaults.ContentTopPadding, bottom = 24.dp)
    ) {
        ListSection {
            SharedItemsRow(state.items, loading = state.phase == SharePhase.Loading)
        }
        ListSection(
            header = stringResource(R.string.share_note_header),
            headerStyle = ListHeaderStyle.Title
        ) {
            TextFieldRow(
                value = state.note,
                onValueChange = actions.note,
                placeholder = stringResource(R.string.share_note_placeholder),
                minLines = 2,
                maxLines = 6
            )
        }
        ListSection(
            header = stringResource(R.string.share_project_header),
            headerStyle = ListHeaderStyle.Title
        ) {
            val mac = state.mac
            if (state.macs.size > 1 && mac != null) {
                PickerRow(
                    title = stringResource(R.string.share_computer),
                    options = state.macs,
                    selected = mac,
                    onSelect = { actions.mac(it.serverId) },
                    optionLabel = { it.name }
                )
            }
            PickerRow(
                title = stringResource(R.string.share_project),
                options = state.projects,
                selected = state.selectedProject,
                onSelect = { it?.let { project -> actions.project(project.name) } },
                optionLabel = { it?.title.orEmpty() }
            )
        }
        ListSection(
            header = stringResource(R.string.share_send_to),
            headerStyle = ListHeaderStyle.Title
        ) {
            if (state.agents.isNotEmpty()) {
                DestinationRow(
                    title = stringResource(R.string.share_new_agent_tab),
                    detail = stringResource(R.string.share_new_agent_tab_detail),
                    icon = painterResource(DesignR.drawable.ic_add_box),
                    chosen = state.destination == ShareDestination.Agent,
                    onClick = { actions.destination(ShareDestination.Agent) }
                )
                val agent = state.selectedAgent
                if (state.destination == ShareDestination.Agent && state.agents.size > 1 &&
                    agent != null
                ) {
                    PickerRow(
                        title = stringResource(R.string.share_agent),
                        options = state.agents,
                        selected = agent,
                        onSelect = { actions.agent(it.id) },
                        optionLabel = { it.label }
                    )
                }
            }
            DestinationRow(
                title = stringResource(R.string.share_notes),
                detail = stringResource(R.string.share_notes_detail),
                icon = painterResource(DesignR.drawable.ic_article),
                chosen = state.destination == ShareDestination.Notes,
                onClick = { actions.destination(ShareDestination.Notes) }
            )
        }
    }
}

private const val SENT_CLOSE_MS = 900L

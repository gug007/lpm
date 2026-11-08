package cx.lpm.mobile.feature.projects.services

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ActivityIndicatorSize
import cx.lpm.mobile.core.designsystem.component.AlertButton
import cx.lpm.mobile.core.designsystem.component.AlertRole
import cx.lpm.mobile.core.designsystem.component.GlassCapsuleButton
import cx.lpm.mobile.core.designsystem.component.LpmAlert
import cx.lpm.mobile.core.designsystem.component.ModalSheet
import cx.lpm.mobile.core.designsystem.component.StatusDot
import cx.lpm.mobile.core.designsystem.component.rememberModalSheetState
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.LaunchpadOption
import cx.lpm.mobile.core.model.Service
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.core.model.crashed
import cx.lpm.mobile.core.navigation.PresentationScope
import cx.lpm.mobile.feature.projects.ActionRunStep
import cx.lpm.mobile.feature.projects.R
import cx.lpm.mobile.feature.projects.newtab.ActionInputsSlot

/**
 * A service's recent pane output while it runs, or after its command ended while its
 * pane is still open — the phone's take on the desktop's service pane, with its
 * Start/Stop in the bar, or Restart once it ended. Always dark, like a terminal. Error
 * lines are red, and under a crashed service's log Fix with … rows hand the crash to an
 * agent in a new tab ([onSpawnedTerminal]); a service that [crashed] opens tall, its log
 * and the ways to fix it both in view. [actionInputs] asks for an agent action's inputs.
 */
@Composable
fun ServiceLogsSheet(
    project: String,
    service: Service,
    session: SessionKey,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    crashed: Boolean = false,
    onSpawnedTerminal: (TerminalInfo) -> Unit = {},
    actionInputs: ActionInputsSlot = { _, _, _ -> }
) {
    val tall = remember { crashed }
    PresentationScope {
        ServiceLogsContent(
            project,
            service,
            session,
            onDismiss,
            tall,
            onSpawnedTerminal,
            actionInputs,
            modifier
        )
    }
}

@Composable
private fun ServiceLogsContent(
    project: String,
    service: Service,
    session: SessionKey,
    onDismiss: () -> Unit,
    tall: Boolean,
    onSpawnedTerminal: (TerminalInfo) -> Unit,
    actionInputs: ActionInputsSlot,
    modifier: Modifier = Modifier,
    viewModel: ServiceLogsViewModel =
        hiltViewModel<ServiceLogsViewModel, ServiceLogsViewModel.Factory>(
            creationCallback = { it.create(project, service.name, session) }
        )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val sheet = rememberModalSheetState()
    val haptics = LocalHapticFeedback.current
    val fixing = {
        haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
        sheet.dismiss(onDismiss)
    }
    LaunchedEffect(viewModel) { viewModel.follow() }
    LaunchedEffect(state.crashed) { if (state.crashed) viewModel.loadAgents() }
    DisposableEffect(viewModel) { onDispose { viewModel.consume() } }
    LpmTheme(darkTheme = true) {
        ModalSheet(
            onDismissRequest = onDismiss,
            modifier = modifier,
            fullHeight = tall,
            state = sheet,
            floating = !tall
        ) {
            Column(Modifier.fillMaxHeight(if (tall) 1f else SHEET_HEIGHT)) {
                LogsBar(
                    service.name,
                    state,
                    onClose = { sheet.dismiss(onDismiss) },
                    onToggle = viewModel::toggle,
                    onRestart = viewModel::restart
                )
                StatusLine(service, state)
                LogsText(
                    state,
                    onFix = { if (viewModel.fix(it, onSpawnedTerminal)) fixing() },
                    modifier = Modifier.weight(1f)
                )
            }
        }
        when (val step = state.step) {
            is ActionRunStep.Inputs -> actionInputs(
                step.action,
                { values -> if (viewModel.submitInputs(values, onSpawnedTerminal)) fixing() },
                { viewModel.dismissStep(step) }
            )

            is ActionRunStep.Confirm -> LpmAlert(
                title = stringResource(R.string.new_tab_run_confirm, step.action.label),
                buttons = listOf(
                    AlertButton(stringResource(R.string.new_tab_run)) {
                        viewModel.confirm(onSpawnedTerminal)
                        fixing()
                    },
                    AlertButton(stringResource(R.string.cancel), AlertRole.Cancel)
                ),
                onDismissRequest = { viewModel.dismissStep(step) }
            )

            null -> Unit
        }
    }
}

@Composable
private fun LogsBar(
    title: String,
    state: ServiceLogsUiState,
    onClose: () -> Unit,
    onToggle: () -> Unit,
    onRestart: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier
            .fillMaxWidth()
            .padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 8.dp)
            .height(44.dp)
    ) {
        GlassCapsuleButton(
            text = stringResource(R.string.logs_close),
            onClick = onClose,
            modifier = Modifier.align(Alignment.CenterStart)
        )
        Text(
            text = title,
            style = LpmTheme.typography.headline,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .align(Alignment.Center)
                .padding(horizontal = 96.dp)
        )
        Box(Modifier.align(Alignment.CenterEnd)) {
            if (state.pending) {
                ActivityIndicator(size = ActivityIndicatorSize.Small)
            } else if (state.ended != null) {
                GlassCapsuleButton(
                    text = stringResource(R.string.logs_restart),
                    onClick = onRestart,
                    textStyle = LpmTheme.typography.headline
                )
            } else {
                GlassCapsuleButton(
                    text = stringResource(
                        if (state.running) R.string.logs_stop else R.string.logs_start
                    ),
                    onClick = onToggle,
                    textStyle = LpmTheme.typography.headline
                )
            }
        }
    }
}

/**
 * Whether the service runs (or is on its way), or how it ended, its port and a spinner
 * while toggling.
 */
@Composable
private fun StatusLine(service: Service, state: ServiceLogsUiState, modifier: Modifier = Modifier) {
    val colors = LpmTheme.colors
    val ended = state.ended
    val (dot, text) = when {
        state.pending && state.running -> colors.blue to stringResource(R.string.logs_stopping)
        state.pending -> colors.blue to stringResource(R.string.logs_starting)
        ended != null -> (if (ended.crashed) colors.red else colors.gray3) to endedStatus(ended)
        state.running -> colors.green to stringResource(R.string.logs_running)
        else -> colors.gray3 to stringResource(R.string.logs_stopped)
    }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(colors.secondarySystemBackground)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        StatusDot(dot)
        Text(
            text = text,
            style = LpmTheme.typography.subheadline.copy(fontWeight = FontWeight.Medium),
            maxLines = 1
        )
        if (service.port > 0) {
            Text(
                text = ":${service.port}",
                style = LpmTheme.typography.subheadline.copy(fontFeatureSettings = "tnum"),
                color = colors.secondaryLabel
            )
        }
        Box(Modifier.weight(1f))
        if (state.pending) ActivityIndicator(size = ActivityIndicatorSize.Small)
    }
}

/** "Exited with code 1", "Exited", or "Stopped" when the shell couldn't say. */
@Composable
private fun endedStatus(ended: Service): String {
    val code = ended.exitCode ?: return stringResource(R.string.logs_stopped)
    return if (code == 0) {
        stringResource(R.string.logs_exited)
    } else {
        stringResource(R.string.logs_exited_code, code)
    }
}

/**
 * The output, kept scrolled to its end as it grows, or why there's none; under a
 * crashed service's, the ways to fix it.
 */
@Composable
private fun LogsText(
    state: ServiceLogsUiState,
    onFix: (LaunchpadOption) -> Unit,
    modifier: Modifier = Modifier
) {
    val scroll = rememberScrollState()
    LaunchedEffect(state.text, state.crashed, state.fixTabs?.size) {
        scroll.scrollTo(scroll.maxValue)
    }
    Column(
        modifier
            .fillMaxWidth()
            .verticalScroll(scroll)
    ) {
        LogsOutput(state, Modifier.padding(16.dp))
        if (state.crashed) ServiceCrashPanel(state, onFix, Modifier.padding(bottom = 20.dp))
    }
}

@Composable
private fun LogsOutput(state: ServiceLogsUiState, modifier: Modifier = Modifier) {
    val colors = LpmTheme.colors
    val secondary = colors.secondaryLabel
    val log = remember(state.text, colors.red) { tintedLog(state.text, colors.red) }
    Column(modifier.fillMaxWidth()) {
        when {
            state.text.isEmpty() && state.error != null ->
                Text(state.error, style = LpmTheme.typography.body, color = secondary)

            state.text.isEmpty() -> Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (state.running) ActivityIndicator(size = ActivityIndicatorSize.Small)
                Text(
                    text = stringResource(
                        when {
                            state.running -> R.string.logs_waiting
                            state.ended != null -> R.string.logs_no_output
                            else -> R.string.logs_not_running
                        }
                    ),
                    style = LpmTheme.typography.body,
                    color = secondary
                )
            }

            else -> SelectionContainer {
                Text(
                    text = log,
                    style = LpmTheme.typography.caption1.copy(fontFamily = FontFamily.Monospace)
                )
            }
        }
    }
}

/** iOS opens it at the medium detent. */
private const val SHEET_HEIGHT = 0.55f

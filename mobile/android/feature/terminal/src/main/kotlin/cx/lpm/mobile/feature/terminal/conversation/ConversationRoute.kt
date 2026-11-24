package cx.lpm.mobile.feature.terminal.conversation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleStartEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.model.AgentState

/** The conversation over an agent's terminal; [onShowTerminal] for what only it can answer. */
@Composable
internal fun ConversationRoute(
    target: ConversationTarget,
    background: Color,
    onOpenPath: (String) -> Unit,
    onShowTerminal: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: ConversationViewModel =
        hiltViewModel<ConversationViewModel, ConversationViewModel.Factory>(
            key = "conversation:${target.session}:${target.terminal}",
            creationCallback = { it.create(target) }
        )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    LifecycleStartEffect(viewModel) {
        viewModel.watch()
        onStopOrDispose { viewModel.unwatch() }
    }
    val waiting = state.agent?.takeIf { it.state == AgentState.NeedsYou }
    if (waiting != null) {
        LaunchedEffect(waiting.id, waiting.since) { viewModel.followDialog(waiting.id) }
    }
    val (details, ask) = state.details to state.ask
    val actions = remember(viewModel, details, ask, onOpenPath, onShowTerminal) {
        ConversationActions(
            onLoadEarlier = viewModel::loadEarlier,
            onLoadDetail = viewModel::loadDetail,
            detail = { viewModel.detail(details, it) },
            onOpenPath = onOpenPath,
            onShowTerminal = onShowTerminal,
            onPick = { option -> ask?.let { viewModel.pick(it, option) } }
        )
    }
    ConversationScreen(
        state = state,
        background = background,
        actions = actions,
        modifier = modifier
    )
}

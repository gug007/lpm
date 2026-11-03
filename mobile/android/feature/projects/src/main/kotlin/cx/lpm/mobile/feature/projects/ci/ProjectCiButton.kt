package cx.lpm.mobile.feature.projects.ci

import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.model.CiCheck
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.feature.projects.newtab.ActionInputsSlot
import kotlinx.coroutines.delay

/**
 * The project's CI beside the bar's Back button (iOS `CiStatusButton`, which sits there
 * too so the title keeps its room), and the sheet it opens. Asks the Mac while the bar
 * shows it. [onSpawnedTerminal] opens the tab a Fix with … row starts; [actionInputs] asks
 * for an agent action's inputs before it runs.
 */
@Composable
fun RowScope.ProjectCiButton(
    project: String,
    session: SessionKey,
    onSpawnedTerminal: (TerminalInfo) -> Unit,
    modifier: Modifier = Modifier,
    actionInputs: ActionInputsSlot = { _, _, _ -> },
    viewModel: GitChecksViewModel =
        hiltViewModel<GitChecksViewModel, GitChecksViewModel.Factory>(
            key = "git-checks:$session:$project",
            creationCallback = { it.create(project, session) }
        )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    FollowChecks(state, viewModel::load)
    var open by remember { mutableStateOf(false) }
    if (!state.available || state.checks?.verdict == null) return
    Spacer(Modifier.width(8.dp))
    CiStatusButton(state, onClick = { open = true }, modifier = modifier)
    if (open) {
        LaunchedEffect(viewModel) { viewModel.loadAgents() }
        GitChecksSheet(
            state = state,
            fix = CiFixActions(
                start = { viewModel.fix(it, onSpawnedTerminal) },
                submitInputs = { viewModel.submitInputs(it, onSpawnedTerminal) },
                confirm = { viewModel.confirm(onSpawnedTerminal) },
                dismissStep = viewModel::dismissStep
            ),
            onRerun = viewModel::rerun,
            onDismiss = { open = false },
            actionInputs = actionInputs
        )
    }
}

/**
 * Every 20 s while a check runs, a minute otherwise, and 5 s after a push or a branch
 * switch (a push lands on GitHub a moment after git moves, and its checks a moment after
 * that). A local commit tells GitHub nothing, so it asks nothing.
 */
@Composable
private fun FollowChecks(state: GitChecksUiState, load: () -> Unit) {
    if (!state.available) return
    val currentLoad by rememberUpdatedState(load)
    val pending = state.checks?.verdict == CiCheck.State.PENDING
    var asked by remember { mutableStateOf(false) }
    LaunchedEffect(pending) {
        val wait = if (pending) 20_000L else 60_000L
        // Checks starting or finishing came with an answer; the next one is a wait away.
        if (asked) delay(wait)
        asked = true
        while (true) {
            currentLoad()
            delay(wait)
        }
    }
    var seen by remember { mutableStateOf(state.branch to state.ahead) }
    LaunchedEffect(state.branch, state.ahead) {
        val (branch, ahead) = seen
        seen = state.branch to state.ahead
        if (branch == state.branch && state.ahead >= ahead) return@LaunchedEffect
        delay(5_000L)
        currentLoad()
    }
}

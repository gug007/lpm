package cx.lpm.mobile.feature.projects.ci

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.feature.projects.newtab.ActionInputsSlot

/** The key the project's CI view model goes by, so the menu and the Git section share one. */
internal fun gitChecksKey(project: String, session: SessionKey) = "git-checks:$session:$project"

/**
 * The CI sheet over [viewModel], from the project menu or the project's Git section.
 * [onSpawnedTerminal] is told about the tab a fix opens. What it said about a merge is
 * forgotten once it closes.
 */
@Composable
internal fun GitChecksSheetHost(
    project: String,
    session: SessionKey,
    onSpawnedTerminal: (TerminalInfo) -> Unit,
    actionInputs: ActionInputsSlot,
    onDismiss: () -> Unit,
    viewModel: GitChecksViewModel =
        hiltViewModel<GitChecksViewModel, GitChecksViewModel.Factory>(
            key = gitChecksKey(project, session),
            creationCallback = { it.create(project, session) }
        )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    LaunchedEffect(viewModel) { viewModel.loadAgents() }
    DisposableEffect(viewModel) {
        onDispose { viewModel.forgetMerge() }
    }
    GitChecksSheet(
        state = state,
        fix = CiFixActions(
            start = { viewModel.fix(it, onSpawnedTerminal) },
            submitInputs = { viewModel.submitInputs(it, onSpawnedTerminal) },
            confirm = { viewModel.confirm(onSpawnedTerminal) },
            dismissStep = viewModel::dismissStep
        ),
        onRerun = viewModel::rerun,
        onDismiss = onDismiss,
        actionInputs = actionInputs,
        merge = CiMergeActions(
            merge = viewModel::merge,
            pickMethod = viewModel::pickMergeMethod,
            reload = viewModel::load
        )
    )
}

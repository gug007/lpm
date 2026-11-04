package cx.lpm.mobile.feature.projects.ci

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import cx.lpm.mobile.core.model.CiCheck
import kotlinx.coroutines.delay

/**
 * Every 20 s while a check runs, a minute otherwise, and 5 s after a push or a branch
 * switch (a push lands on GitHub a moment after git moves, and its checks a moment after
 * that). A local commit tells GitHub nothing, so it asks nothing.
 */
@Composable
internal fun FollowChecks(state: GitChecksUiState, load: () -> Unit) {
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

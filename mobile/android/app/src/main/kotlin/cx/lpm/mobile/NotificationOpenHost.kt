package cx.lpm.mobile

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.push.NotificationOpenTarget
import cx.lpm.mobile.core.data.push.NotificationOpens
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.navigation.AutomationKey
import cx.lpm.mobile.core.navigation.AutomationsKey
import cx.lpm.mobile.core.navigation.GitReviewKey
import cx.lpm.mobile.core.navigation.Navigator
import cx.lpm.mobile.core.navigation.ProjectKey
import cx.lpm.mobile.core.navigation.TerminalKey
import cx.lpm.mobile.core.navigation.UsageKey
import cx.lpm.mobile.core.navigation.WeeklyRecapKey
import kotlinx.coroutines.delay

/**
 * Opens a tapped notification's destination (iOS `ContentView.consumePendingOpen`):
 * first the Mac it came from, then — once that Mac's projects are in — the project,
 * its terminal, the automation, or the weekly recap. A project the list doesn't
 * have yet (a copy made while the phone was away) gets a moment to arrive; after that
 * the tap is dropped rather than acted on at some unrelated later moment.
 */
@Composable
internal fun NotificationOpenHost(
    session: MacSession,
    opens: NotificationOpens,
    navigator: Navigator
) {
    val target by opens.pending.collectAsStateWithLifecycle()
    val state by session.state.collectAsStateWithLifecycle()
    val projectsStore = remember(session) { session.store<ProjectsStore>() }
    val projects by projectsStore.state.collectAsStateWithLifecycle()
    var awaited by remember { mutableStateOf<NotificationOpenTarget?>(null) }
    val names = projects.projects.map { it.name }
    LaunchedEffect(target, state.activeMacId, projects.projectsLoaded, names) {
        val open = target ?: return@LaunchedEffect
        if (open.serverId != null && state.activeRecord?.serverId != open.serverId) {
            // A Mac this phone no longer has: nothing to open.
            val mac = state.macs.firstOrNull { it.serverId == open.serverId }
                ?: return@LaunchedEffect opens.clear(open)
            navigator.reset()
            session.switchTo(mac)
            return@LaunchedEffect
        }
        if (!projects.projectsLoaded) return@LaunchedEffect
        val known = open.project in names
        val item = open.itemId
        when (open.kind) {
            NotificationOpenTarget.Kind.Project -> {
                if (!known) return@LaunchedEffect run { awaited = open }
                navigator.reset(ProjectKey(open.project))
            }

            NotificationOpenTarget.Kind.Terminal -> {
                if (!known || item == null) return@LaunchedEffect run { awaited = open }
                navigator.reset(ProjectKey(open.project), TerminalKey(open.project, item))
            }

            NotificationOpenTarget.Kind.Automation -> {
                if (item == null) return@LaunchedEffect opens.clear(open)
                navigator.reset(AutomationsKey(), AutomationKey(open.project, item))
            }

            NotificationOpenTarget.Kind.Recap -> navigator.reset(WeeklyRecapKey())

            NotificationOpenTarget.Kind.Usage -> navigator.reset(UsageKey())

            NotificationOpenTarget.Kind.Changes -> {
                if (!known) return@LaunchedEffect run { awaited = open }
                navigator.reset(ProjectKey(open.project), GitReviewKey(open.project))
            }
        }
        opens.clear(open)
    }
    LaunchedEffect(awaited) {
        val open = awaited ?: return@LaunchedEffect
        delay(AWAIT_PROJECT_MS)
        opens.clear(open)
        awaited = null
    }
}

private const val AWAIT_PROJECT_MS = 10_000L

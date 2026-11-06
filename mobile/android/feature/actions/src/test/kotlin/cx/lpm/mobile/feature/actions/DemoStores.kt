package cx.lpm.mobile.feature.actions

import cx.lpm.mobile.core.data.actions.ActionPopupStore
import cx.lpm.mobile.core.data.actions.ActionsStore
import cx.lpm.mobile.core.data.config.ProjectConfigStore
import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.Action
import cx.lpm.mobile.core.testing.TestSession
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope

/** The stores beyond Projects/Terminals that the actions screens read. */
val ActionStores: Set<SessionStore.Factory> = setOf(
    SessionStore.Factory(::ActionsStore),
    SessionStore.Factory(::ActionPopupStore),
    SessionStore.Factory(::ProjectConfigStore)
)

/** A session in Demo Mode with the sample Mac's first answers in. */
fun TestScope.demoSession(): TestSession = TestSession(this, ActionStores).apply {
    enterDemo()
    settle()
}

/** Let the demo Mac answer everything sent so far. */
@OptIn(ExperimentalCoroutinesApi::class)
fun TestSession.settle(millis: Long = SETTLE_MS) {
    scheduler.advanceTimeBy(millis)
    scheduler.runCurrent()
}

/** A demo project's action by name, children included. */
fun TestSession.demoAction(project: String, name: String): Action {
    fun find(actions: List<Action>): Action? =
        actions.firstNotNullOfOrNull { if (it.name == name) it else find(it.children) }
    val actions = store<ProjectsStore>().state.value.project(project)?.actions.orEmpty()
    return checkNotNull(find(actions)) { "no action $name in $project" }
}

private const val SETTLE_MS = 1_000L

package cx.lpm.mobile.feature.projects

import cx.lpm.mobile.core.data.actions.ActionsStore
import cx.lpm.mobile.core.data.agents.AgentLaunchStore
import cx.lpm.mobile.core.data.automations.AutomationsStore
import cx.lpm.mobile.core.data.claude.ClaudeAccountsStore
import cx.lpm.mobile.core.data.config.ProjectConfigStore
import cx.lpm.mobile.core.data.files.ProjectFilesStore
import cx.lpm.mobile.core.data.git.GitAutoStore
import cx.lpm.mobile.core.data.git.GitHistoryStore
import cx.lpm.mobile.core.data.git.GitStore
import cx.lpm.mobile.core.data.machines.MachineImporter
import cx.lpm.mobile.core.data.services.ServiceLogsStore
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.data.usage.UsageStore
import cx.lpm.mobile.core.testing.TestSession
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope

/** The stores beyond Projects/Terminals that the projects screens read. */
val ScreenStores: Set<SessionStore.Factory> = setOf(
    SessionStore.Factory(::AutomationsStore),
    SessionStore.Factory(::GitStore),
    SessionStore.Factory(::GitHistoryStore),
    SessionStore.Factory(::GitAutoStore),
    SessionStore.Factory(::ServiceLogsStore),
    SessionStore.Factory(::ProjectConfigStore),
    SessionStore.Factory(::ActionsStore),
    SessionStore.Factory(::ClaudeAccountsStore),
    SessionStore.Factory(::UsageStore),
    SessionStore.Factory(::MachineImporter),
    SessionStore.Factory(::AgentLaunchStore),
    SessionStore.Factory(::ProjectFilesStore)
)

/** A session in Demo Mode with the sample Mac's first answers in. */
fun TestScope.demoSession(): TestSession = TestSession(this, ScreenStores).apply {
    enterDemo()
    settle()
}

/** Let the demo Mac answer everything sent so far. */
@OptIn(ExperimentalCoroutinesApi::class)
fun TestSession.settle(millis: Long = SETTLE_MS) {
    scheduler.advanceTimeBy(millis)
    scheduler.runCurrent()
}

private const val SETTLE_MS = 1_000L

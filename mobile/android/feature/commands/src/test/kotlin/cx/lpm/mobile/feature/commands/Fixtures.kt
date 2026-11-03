package cx.lpm.mobile.feature.commands

import cx.lpm.mobile.core.data.commands.LpmCommandsStore
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.testing.TestSession
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope

/** The lpm commands store as the app contributes it. */
val CommandStores: Set<SessionStore.Factory> = setOf(SessionStore.Factory(::LpmCommandsStore))

/** A session in Demo Mode with the sample Mac's first answers in. */
fun TestScope.demoSession(): TestSession = TestSession(this, CommandStores).apply {
    enterDemo()
    settle()
}

/** A session on a Mac the test answers for itself. */
fun TestScope.liveSession(): TestSession = TestSession(this, CommandStores)

/** Let the demo Mac answer everything sent so far. */
@OptIn(ExperimentalCoroutinesApi::class)
fun TestSession.settle(millis: Long = 1_000) {
    scheduler.advanceTimeBy(millis)
    scheduler.runCurrent()
}

val TestSession.commands: LpmCommandsStore get() = store()

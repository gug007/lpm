package cx.lpm.mobile.feature.git

import cx.lpm.mobile.core.data.git.GitAutoStore
import cx.lpm.mobile.core.data.git.GitStore
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.testing.TestSession
import cx.lpm.mobile.feature.git.data.ReviewDraftsStore
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope

/** The review's stores: Git's own and the drafts this module keeps alongside it. */
val ReviewStores: Set<SessionStore.Factory> =
    setOf(SessionStore.Factory(::GitStore), SessionStore.Factory(::ReviewDraftsStore))

/** A session in Demo Mode, where `storefront` has four uncommitted changes. */
fun TestScope.demoSession(): TestSession = TestSession(
    this,
    ReviewStores + SessionStore.Factory(::GitAutoStore)
).apply {
    enterDemo()
    settle()
}

/** Let the demo Mac answer everything sent so far. */
@OptIn(ExperimentalCoroutinesApi::class)
fun TestSession.settle(millis: Long = 1_000) {
    scheduler.advanceTimeBy(millis)
    scheduler.runCurrent()
}

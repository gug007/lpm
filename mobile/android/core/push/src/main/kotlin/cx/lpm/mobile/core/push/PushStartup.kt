package cx.lpm.mobile.core.push

import cx.lpm.mobile.core.data.di.ApplicationScope
import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.push.PushRegistrar
import cx.lpm.mobile.core.data.push.PushTokenSource
import cx.lpm.mobile.core.data.session.MacSession
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/**
 * Push, once the app has loaded its stored keys: the channels, the token, the
 * registration with every Mac, the agents-at-work card, the banner for another agent
 * starting to wait while the app is open, and withdrawing what the
 * live Mac's projects say is over — a backstop for withdrawals that never arrived (a
 * stopped app gets no FCM).
 */
@Singleton
class PushStartup @Inject constructor(
    private val tokens: FcmPushTokens,
    private val registrar: PushRegistrar,
    private val notifier: PushNotifier,
    private val live: LivePublisher,
    private val liveCards: LiveNotifier,
    private val headsUp: WaitingHeadsUpNotifier,
    private val session: MacSession,
    @param:ApplicationScope private val scope: CoroutineScope
) {
    fun start() {
        notifier.createChannels()
        tokens.register()
        registrar.start()
        live.start()
        headsUp.start()
        scope.launch {
            session.store<ProjectsStore>().state
                .map { it.projects }
                .distinctUntilChanged()
                .collect { projects ->
                    // Only a list the Mac just sent, not one restored from the cache.
                    val state = session.state.value
                    if (state.isReady && !state.demoMode) {
                        notifier.reconcile(projects, state.activeRecord?.serverId)
                    }
                }
        }
    }

    /**
     * The app is back on screen: notifications may have been allowed meanwhile, and
     * an agents-at-work card that ended has been seen.
     */
    fun resumed() {
        tokens.register()
        registrar.refreshPermission()
        liveCards.appOpened()
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface PushModule {
    @Binds
    fun pushTokenSource(impl: FcmPushTokens): PushTokenSource
}

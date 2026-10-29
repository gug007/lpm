package cx.lpm.mobile

import cx.lpm.mobile.core.data.di.ApplicationScope
import cx.lpm.mobile.core.data.lock.AppLock
import cx.lpm.mobile.core.data.mac.CredentialStore
import cx.lpm.mobile.core.data.prefs.AppPreferences
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.push.PushStartup
import cx.lpm.mobile.feature.usage.widget.UsageWidgetPublisher
import cx.lpm.mobile.feature.widgets.AgentWidgetPublisher
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Loads what iOS reads synchronously at launch (UserDefaults, the Keychain), then
 * bootstraps the session. The splash screen stays up until it's ready.
 */
@Singleton
class AppStartup @Inject constructor(
    private val preferences: AppPreferences,
    private val credentials: CredentialStore,
    private val session: MacSession,
    private val push: PushStartup,
    private val widgets: AgentWidgetPublisher,
    private val usageWidget: UsageWidgetPublisher,
    private val lock: AppLock,
    @param:ApplicationScope private val scope: CoroutineScope
) {
    private val mutableReady = MutableStateFlow(false)
    val ready: StateFlow<Boolean> = mutableReady.asStateFlow()
    private var started = false

    fun start() {
        if (started) return
        started = true
        scope.launch {
            preferences.load()
            lock.load()
            credentials.load()
            session.bootstrap()
            push.start()
            widgets.start()
            usageWidget.start()
            mutableReady.value = true
        }
    }
}

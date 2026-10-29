package cx.lpm.mobile

import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import cx.lpm.mobile.core.data.lock.AppLock
import cx.lpm.mobile.core.data.push.NotificationOpenTarget
import cx.lpm.mobile.core.data.push.NotificationOpens
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.designsystem.component.ConfirmRisky
import cx.lpm.mobile.core.designsystem.component.LocalConfirmRisky
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.push.PushNotifier
import cx.lpm.mobile.core.push.PushStartup
import cx.lpm.mobile.core.tailnet.BuiltInTailscale
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import kotlinx.coroutines.launch

@AndroidEntryPoint
class MainActivity : FragmentActivity() {
    @Inject
    lateinit var session: MacSession

    @Inject
    lateinit var tailscale: BuiltInTailscale

    @Inject
    lateinit var opens: NotificationOpens

    @Inject
    lateinit var push: PushStartup

    @Inject
    lateinit var lock: AppLock

    private val viewModel: AppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        splash.setKeepOnScreenCondition { !viewModel.ready.value }
        viewModel.start()
        lock.attach(BiometricOwnerCheck(this))
        // A recreated activity was already handed this intent.
        if (savedInstanceState == null) openNotification(intent)
        enableEdgeToEdge()
        setContent {
            val ready by viewModel.ready.collectAsStateWithLifecycle()
            val appearance by viewModel.appearance.collectAsStateWithLifecycle()
            val dark = appearance.isDark(isSystemInDarkTheme())
            DisposableEffect(dark) {
                val style = if (dark) {
                    SystemBarStyle.dark(Color.TRANSPARENT)
                } else {
                    SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
                }
                enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
                onDispose {}
            }
            val locked by lock.state.collectAsStateWithLifecycle()
            // Asks straight away when the app opens locked.
            LaunchedEffect(ready) { if (ready) lock.unlock() }
            DisposableEffect(locked.enabled) {
                // The recent-apps preview stays blank while the lock is on.
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    setRecentsScreenshotEnabled(!locked.enabled)
                }
                onDispose {}
            }
            val confirmRisky = remember {
                ConfirmRisky { reason, action -> lock.confirm(lifecycleScope, reason, action) }
            }
            LpmTheme(darkTheme = dark) {
                Box {
                    if (ready) {
                        CompositionLocalProvider(LocalConfirmRisky provides confirmRisky) {
                            LpmApp(session, tailscale.state, opens)
                        }
                    }
                    if (ready && locked.locked) {
                        AppLockCover(onUnlock = { lifecycleScope.launch { lock.unlock() } })
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        openNotification(intent)
    }

    override fun onResume() {
        super.onResume()
        push.resumed()
    }

    override fun onStart() {
        super.onStart()
        if (viewModel.ready.value) lock.onForeground(lifecycleScope)
    }

    override fun onStop() {
        super.onStop()
        lock.onBackground()
    }

    override fun onDestroy() {
        lock.attach(null)
        super.onDestroy()
    }

    private fun openNotification(intent: Intent) {
        if (intent.action != PushNotifier.ACTION_OPEN) return
        val target = NotificationOpenTarget.from(intent::getStringExtra) ?: return
        // An Agents widget row names a Mac too old to send a server id by its local id.
        val mac = session.state.value.macs.firstOrNull { it.localId == target.serverId }
        opens.open(if (mac != null) target.copy(serverId = mac.serverId) else target)
    }
}

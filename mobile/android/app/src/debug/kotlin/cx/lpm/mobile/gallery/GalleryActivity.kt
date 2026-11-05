package cx.lpm.mobile.gallery

import android.content.res.Configuration
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.web.TerminalWebPool

/**
 * The design-system gallery (debug builds only): the shared components laid out like
 * the iOS reference screens, for side-by-side screenshots.
 *
 *   adb shell am start -n cx.lpm.mobile/.gallery.GalleryActivity --es screen detail --ez dark false
 *
 * Screens: index, pairing, projects, detail, menu, automations, settings, terminal,
 * controls, webterminal, markdown, filepreview. Remove src/debug to drop it.
 */
class GalleryActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val systemDark = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK ==
            Configuration.UI_MODE_NIGHT_YES
        val dark = intent.getBooleanExtra(EXTRA_DARK, systemDark)
        val bars = if (dark) {
            SystemBarStyle.dark(Color.TRANSPARENT)
        } else {
            SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
        }
        enableEdgeToEdge(statusBarStyle = bars, navigationBarStyle = bars)
        val screen = GalleryScreen.entries.firstOrNull {
            it.key ==
                intent.getStringExtra(EXTRA_SCREEN)
        }
        setContent {
            LpmTheme(darkTheme = dark) {
                Gallery(start = screen ?: GalleryScreen.Index)
            }
        }
        TerminalWebPool.prewarm(this)
    }

    private companion object {
        const val EXTRA_SCREEN = "screen"
        const val EXTRA_DARK = "dark"
    }
}

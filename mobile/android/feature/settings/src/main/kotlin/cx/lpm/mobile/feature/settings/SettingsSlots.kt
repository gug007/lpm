package cx.lpm.mobile.feature.settings

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.res.stringResource

/**
 * The parts of Settings other features own, wired by the app (features don't depend
 * on each other). A page is pushed inside the sheet and returns with `onBack`; until
 * its feature fills it, it's a bare page with the row's title.
 */
@Immutable
class SettingsSlots(
    /** Built-in Tailscale's page (`:feature:connection`). */
    val tailscalePage: @Composable (onBack: () -> Unit) -> Unit = { onBack ->
        SettingsPage(stringResource(R.string.settings_tailscale), onBack) {}
    },
    /** The terminal's font size, color scheme and preview rows (`:feature:terminal`). */
    val terminalControls: @Composable () -> Unit = {},
    /** Read aloud's voice and speed (`:feature:speech`). */
    val readAloudPage: @Composable (onBack: () -> Unit) -> Unit = { onBack ->
        SettingsPage(stringResource(R.string.settings_read_aloud), onBack) {}
    },
    /** The version of lpm the live Mac runs, for Help's foot (`:feature:mac`). */
    val macVersion: @Composable () -> String? = { null }
)

package cx.lpm.mobile.feature.settings

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.core.net.toUri
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.component.SheetScaffold
import cx.lpm.mobile.core.navigation.SheetStack
import cx.lpm.mobile.core.navigation.rememberSheetNavigator

/** The rows of Settings that open a page of their own inside the sheet. */
enum class SettingsDestination { Root, Tailscale, ReadAloud, Notifications }

/**
 * The phone's settings, as iOS presents them: a sheet with "Done", whose rows push
 * their pages inside it.
 */
@Composable
fun SettingsSheet(
    onDone: () -> Unit,
    modifier: Modifier = Modifier,
    slots: SettingsSlots = SettingsSlots()
) {
    val navigator = rememberSheetNavigator(SettingsDestination.Root)
    SheetStack(navigator, modifier.fillMaxSize()) { page ->
        when (page) {
            SettingsDestination.Root -> SettingsRoute(onDone, navigator::push, slots)
            SettingsDestination.Tailscale -> slots.tailscalePage(navigator::back)
            SettingsDestination.ReadAloud -> slots.readAloudPage(navigator::back)
            SettingsDestination.Notifications -> NotificationSettingsPage(navigator::back)
        }
    }
}

@Composable
private fun SettingsRoute(
    onDone: () -> Unit,
    onOpen: (SettingsDestination) -> Unit,
    slots: SettingsSlots,
    viewModel: SettingsViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    SheetScaffold(
        title = stringResource(R.string.settings_title),
        onDone = onDone,
        doneLabel = stringResource(R.string.settings_done)
    ) {
        SettingsContent(
            state = state,
            onAppearanceChange = viewModel::setAppearance,
            onOpen = onOpen,
            onPrivacyPolicy = { context.openPrivacyPolicy() },
            terminalControls = slots.terminalControls,
            security = { SecuritySection() }
        )
    }
}

/** The policy in the phone's browser, as iOS opens a `Link` in Safari. */
private fun Context.openPrivacyPolicy() {
    try {
        startActivity(Intent(Intent.ACTION_VIEW, PRIVACY_POLICY_URL.toUri()))
    } catch (_: ActivityNotFoundException) {
        // No browser on this phone.
    }
}

private const val PRIVACY_POLICY_URL = "https://lpm.cx/privacy"

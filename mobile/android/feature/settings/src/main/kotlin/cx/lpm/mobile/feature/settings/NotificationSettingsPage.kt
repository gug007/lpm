package cx.lpm.mobile.feature.settings

import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.data.prefs.NotificationPrefs
import cx.lpm.mobile.core.designsystem.component.LinkButton
import cx.lpm.mobile.core.designsystem.component.ToggleRow
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.ui.NotificationAccess
import cx.lpm.mobile.core.ui.openNotificationSettings
import cx.lpm.mobile.core.ui.rememberNotificationAccess

/** Settings → Notifications, pushed inside the Settings sheet. */
@Composable
fun NotificationSettingsPage(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: NotificationSettingsViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val (access, request) = rememberNotificationAccess()
    val context = LocalContext.current
    SettingsPage(stringResource(R.string.settings_notifications), onBack, modifier) {
        NotificationSettingsContent(
            state = state,
            access = access,
            onAllow = request,
            onOpenSettings = context::openNotificationSettings,
            onChange = viewModel::update
        )
    }
}

/**
 * The master switch, then each kind of agent and automation news and Monday's weekly
 * recap. The kinds dim while the master is off but keep their values; the
 * agents-at-work card has a switch of its own. Where the phone won't let lpm Link post at all, the footer says
 * so and offers the way to fix it.
 */
@Composable
fun ColumnScope.NotificationSettingsContent(
    state: NotificationSettingsUiState,
    access: NotificationAccess,
    onAllow: () -> Unit,
    onOpenSettings: () -> Unit,
    onChange: ((NotificationPrefs) -> NotificationPrefs) -> Unit
) {
    val prefs = state.prefs
    val on = prefs.enabled
    FormSection(
        footer = {
            when (access) {
                NotificationAccess.Denied -> {
                    FooterText(stringResource(R.string.notify_denied))
                    FooterButton(stringResource(R.string.notify_open_settings), onOpenSettings)
                }

                NotificationAccess.NotDetermined -> {
                    FooterText(stringResource(R.string.notify_nudge))
                    FooterButton(stringResource(R.string.notify_allow), onAllow)
                }

                NotificationAccess.Allowed -> FooterText(stringResource(R.string.notify_nudge))
            }
        }
    ) {
        Toggle(R.string.notify_push, on) { v -> onChange { it.copy(enabled = v) } }
    }
    FormSection(
        header = stringResource(R.string.notify_agents),
        dimmed = !on,
        footer = {
            FooterText(stringResource(R.string.notify_agents_footer))
            if (!state.connected) FooterText(stringResource(R.string.notify_not_connected))
        }
    ) {
        Toggle(R.string.notify_waiting, prefs.waiting, on) { v ->
            onChange { it.copy(waiting = v) }
        }
        Toggle(R.string.notify_finished, prefs.done, on) { v -> onChange { it.copy(done = v) } }
        Toggle(R.string.notify_error, prefs.error, on) { v -> onChange { it.copy(error = v) } }
    }
    ProjectLevelsSection(state.projects, prefs, onChange)
    QuietHoursSection(prefs, onChange)
    FormSection(
        header = stringResource(R.string.notify_automations),
        dimmed = !on,
        footer = { FooterText(stringResource(R.string.notify_automations_footer)) }
    ) {
        Toggle(R.string.notify_started, prefs.automationStarted, on) { v ->
            onChange { it.copy(automationStarted = v) }
        }
        Toggle(R.string.notify_finished, prefs.automationDone, on) { v ->
            onChange { it.copy(automationDone = v) }
        }
        Toggle(R.string.notify_error_or_timeout, prefs.automationError, on) { v ->
            onChange { it.copy(automationError = v) }
        }
    }
    FormSection(
        dimmed = !on,
        footer = { FooterText(stringResource(R.string.notify_weekly_recap_footer)) }
    ) {
        Toggle(R.string.notify_weekly_recap, prefs.weeklyRecap, on) { v ->
            onChange { it.copy(weeklyRecap = v) }
        }
    }
    FormSection(
        header = stringResource(R.string.notify_live_header),
        footer = { FooterText(stringResource(R.string.notify_live_footer)) }
    ) {
        Toggle(R.string.notify_live, prefs.liveActivity) { v ->
            onChange { it.copy(liveActivity = v) }
        }
    }
}

@Composable
private fun Toggle(
    title: Int,
    checked: Boolean,
    enabled: Boolean = true,
    onCheckedChange: (Boolean) -> Unit
) {
    ToggleRow(
        title = stringResource(title),
        checked = checked,
        onCheckedChange = onCheckedChange,
        enabled = enabled
    )
}

@Composable
private fun FooterButton(text: String, onClick: () -> Unit) {
    LinkButton(text = text, onClick = onClick, textStyle = LpmTheme.typography.footnote)
}

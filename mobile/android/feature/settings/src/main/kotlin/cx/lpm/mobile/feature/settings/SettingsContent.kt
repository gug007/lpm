package cx.lpm.mobile.feature.settings

import androidx.annotation.DrawableRes
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ListDefaults
import cx.lpm.mobile.core.designsystem.component.ListHeaderStyle
import cx.lpm.mobile.core.designsystem.component.ListSection
import cx.lpm.mobile.core.designsystem.component.NavigationRow
import cx.lpm.mobile.core.designsystem.component.PickerRow
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.AppearanceMode

/** The Settings sheet's sections: away from home, appearance, terminal, the pages, privacy. */
@Composable
fun SettingsContent(
    state: SettingsUiState,
    onAppearanceChange: (AppearanceMode) -> Unit,
    onOpen: (SettingsDestination) -> Unit,
    onPrivacyPolicy: () -> Unit,
    modifier: Modifier = Modifier,
    terminalControls: @Composable () -> Unit = {},
    security: @Composable () -> Unit = {}
) {
    Column(
        modifier
            .verticalScroll(rememberScrollState())
            .padding(top = ListDefaults.ContentTopPadding, bottom = 24.dp)
    ) {
        ListSection(
            header = stringResource(R.string.settings_away),
            headerStyle = ListHeaderStyle.Title,
            footer = stringResource(R.string.settings_away_footer)
        ) {
            NavigationRow(
                title = stringResource(R.string.settings_tailscale),
                onClick = { onOpen(SettingsDestination.Tailscale) },
                value = stringResource(state.tailscale.label),
                leading = { SettingsIcon(DesignR.drawable.ic_language) }
            )
        }
        ListSection(
            header = stringResource(R.string.settings_appearance),
            headerStyle = ListHeaderStyle.Title
        ) {
            PickerRow(
                title = stringResource(R.string.settings_theme),
                options = AppearanceMode.entries,
                selected = state.appearance,
                onSelect = onAppearanceChange,
                optionLabel = { it.label },
                optionIcon = { it.icon }
            )
        }
        ListSection(
            header = stringResource(R.string.settings_terminal),
            headerStyle = ListHeaderStyle.Title,
            footer = stringResource(R.string.settings_terminal_footer)
        ) {
            terminalControls()
        }
        ListSection {
            NavigationRow(
                title = stringResource(R.string.settings_read_aloud),
                onClick = { onOpen(SettingsDestination.ReadAloud) },
                leading = { SettingsIcon(DesignR.drawable.ic_volume_up) }
            )
            NavigationRow(
                title = stringResource(R.string.settings_notifications),
                onClick = { onOpen(SettingsDestination.Notifications) },
                leading = { SettingsIcon(DesignR.drawable.ic_notifications_unread) }
            )
        }
        security()
        ListSection {
            NavigationRow(
                title = stringResource(R.string.settings_privacy_policy),
                onClick = onPrivacyPolicy,
                leading = { SettingsIcon(DesignR.drawable.ic_shield_lock) }
            )
        }
    }
}

private val TailscaleSummary.label: Int
    get() = when (this) {
        TailscaleSummary.Off -> R.string.settings_tailscale_off
        TailscaleSummary.Connected -> R.string.settings_tailscale_connected
        TailscaleSummary.SignIn -> R.string.settings_tailscale_sign_in
        TailscaleSummary.Waiting -> R.string.settings_tailscale_waiting
        TailscaleSummary.Problem -> R.string.settings_tailscale_problem
        TailscaleSummary.Connecting -> R.string.settings_tailscale_connecting
    }

private val AppearanceMode.icon: Int
    get() = when (this) {
        AppearanceMode.System -> DesignR.drawable.ic_smartphone
        AppearanceMode.Light -> DesignR.drawable.ic_light_mode
        AppearanceMode.Dark -> DesignR.drawable.ic_dark_mode
    }

@Composable
private fun SettingsIcon(@DrawableRes icon: Int) {
    Icon(
        painter = painterResource(icon),
        contentDescription = null,
        tint = LpmTheme.colors.tint,
        modifier = Modifier.size(26.dp)
    )
}

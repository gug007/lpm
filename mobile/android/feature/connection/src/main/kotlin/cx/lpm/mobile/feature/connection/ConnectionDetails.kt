package cx.lpm.mobile.feature.connection

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.data.link.ConnectionIssue
import cx.lpm.mobile.core.data.link.IssueAction
import cx.lpm.mobile.core.data.mac.MacRecord
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ListDefaults
import cx.lpm.mobile.core.designsystem.component.ListHeaderStyle
import cx.lpm.mobile.core.designsystem.component.ListLeadingSlot
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.component.ListSection
import cx.lpm.mobile.core.designsystem.component.NavigationRow
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import java.time.Instant

/** The connection sheet's sections, top to bottom. */
@Composable
internal fun ConnectionDetails(
    state: ConnectionSheetUiState,
    onIssueAction: (IssueAction, ConnectionIssue) -> Unit,
    onTestAgain: () -> Unit,
    onOpen: (ConnectionPage) -> Unit,
    onRename: () -> Unit,
    onPairAgain: () -> Unit,
    onRemove: () -> Unit,
    macUpdateSection: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    keepAwakeSection: @Composable () -> Unit = {}
) {
    val record = state.record ?: return
    val link = state.link
    SheetForm(modifier) {
        Header(record, state)
        val issue = link?.view?.issue
        if (link != null && issue != null && (!issue.isConnecting || link.link.slowConnect)) {
            IssueCard(
                state = link.content(issue, IssueStyle.Card),
                hidesDetails = true,
                onAction = { onIssueAction(it, issue) },
                modifier = Modifier.padding(
                    horizontal = ListDefaults.Margin
                ).padding(bottom = 25.dp)
            )
        }
        Addresses(state, onTestAgain)
        ListSection(
            header = stringResource(R.string.connection_this_phone),
            headerStyle = ListHeaderStyle.Title,
            footer = stringResource(R.string.connection_this_phone_footer)
        ) {
            NavigationRow(
                title = stringResource(R.string.tailnet_title),
                value = stringResource(state.tailscale.label()),
                leading = { RowIcon(DesignR.drawable.ic_language) },
                onClick = { onOpen(ConnectionPage.Tailscale) }
            )
        }
        if (!state.isVisit) {
            ListSection(header = record.displayName, headerStyle = ListHeaderStyle.Title) {
                if (record.via == null) {
                    NavigationRow(
                        title = stringResource(R.string.addresses),
                        leading = { RowIcon(DesignR.drawable.ic_device_hub) },
                        onClick = { onOpen(ConnectionPage.Addresses(record.localId)) }
                    )
                }
                ActionRow(stringResource(R.string.rename), DesignR.drawable.ic_edit, onRename)
                if (record.via == null) {
                    ActionRow(
                        stringResource(R.string.pair_again),
                        DesignR.drawable.ic_devices,
                        onPairAgain
                    )
                }
                ActionRow(
                    stringResource(R.string.remove_from_phone),
                    DesignR.drawable.ic_delete,
                    onRemove,
                    destructive = true
                )
            }
        }
        keepAwakeSection()
        macUpdateSection()
        DetailsSection(state)
    }
}

@Composable
private fun Header(record: MacRecord, state: ConnectionSheetUiState) {
    val link = state.link
    val colors = LpmTheme.colors
    val ready = link?.isReady == true
    ListSection {
        ListRow(
            leadingSlot = ListLeadingSlot(width = 44.dp, spacing = 14.dp),
            verticalPadding = 15.dp,
            leading = {
                Box(
                    Modifier
                        .size(44.dp)
                        .background(
                            if (ready) colors.green else colors.gray,
                            RoundedCornerShape(12.dp)
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        painter = painterResource(machineIcon(record)),
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(28.dp)
                    )
                }
            }
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    record.displayName,
                    style = LpmTheme.typography.title3.copy(fontWeight = FontWeight.SemiBold),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (link !=
                    null
                ) {
                    LinkStatusLabel(link.view.statusLine, detail = sinceText(record, state))
                }
            }
        }
    }
}

@Composable
private fun sinceText(record: MacRecord, state: ConnectionSheetUiState): String? {
    val link = state.link ?: return null
    link.link.connectedSince?.let {
        return stringResource(R.string.connection_since, it.clockTime())
    }
    val last = record.lastConnected
    if (link.isReady || last == null) return null
    return stringResource(R.string.connection_last_connected, last.relativeTo(Instant.now()))
}

@Composable
private fun Addresses(state: ConnectionSheetUiState, onTestAgain: () -> Unit) {
    val link = state.link?.link
    val via = state.via
    val footer = when {
        via != null -> stringResource(R.string.connection_via_footer, via.displayName)
        !state.hasAwayAddress -> stringResource(R.string.connection_home_only_footer)
        else -> stringResource(R.string.connection_away_footer)
    }
    ListSection(
        header = via?.let { stringResource(R.string.connection_through, it.displayName) }
            ?: stringResource(R.string.connection_ways),
        headerStyle = ListHeaderStyle.Title,
        footer = footer
    ) {
        state.hosts.forEach { host ->
            AddressStatusRow(
                host = host,
                inUse = state.link?.isReady == true && host == link?.host,
                testing = link?.testing?.contains(host) == true,
                check = link?.checks?.get(host)
            )
        }
        ActionRow(
            stringResource(R.string.connection_test_again),
            DesignR.drawable.ic_refresh,
            onTestAgain,
            enabled = link?.testing.isNullOrEmpty()
        )
    }
}

/** A `Label` button in a list: the icon in the icon column, both in the tint (or red). */
@Composable
internal fun ActionRow(
    text: String,
    icon: Int,
    onClick: () -> Unit,
    enabled: Boolean = true,
    destructive: Boolean = false,
    trailing: (@Composable RowScope.() -> Unit)? = null
) {
    val colors = LpmTheme.colors
    val color = when {
        !enabled -> colors.tertiaryLabel
        destructive -> colors.red
        else -> colors.tint
    }
    ListRow(
        onClick = onClick,
        enabled = enabled,
        leading = { RowIcon(icon, color) },
        trailing = trailing
    ) {
        Text(text, style = LpmTheme.typography.body, color = color)
    }
}

@Composable
internal fun RowIcon(icon: Int, tint: Color = LpmTheme.colors.tint) {
    Icon(
        painterResource(icon),
        contentDescription = null,
        tint = tint,
        modifier = Modifier.size(24.dp)
    )
}

internal fun machineIcon(record: MacRecord): Int =
    if (record.isLinuxHost) DesignR.drawable.ic_dns else DesignR.drawable.ic_desktop_mac

internal fun TailscaleSummary.label(): Int = when (this) {
    TailscaleSummary.Off -> R.string.tailscale_off
    TailscaleSummary.Connected -> R.string.tailscale_connected
    TailscaleSummary.SignIn -> R.string.tailscale_sign_in
    TailscaleSummary.Waiting -> R.string.tailscale_waiting
    TailscaleSummary.Problem -> R.string.tailscale_problem
    TailscaleSummary.Connecting -> R.string.tailscale_connecting
}

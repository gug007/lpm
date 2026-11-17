package cx.lpm.mobile.feature.projects.list

import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R
import cx.lpm.mobile.core.designsystem.component.LinkButton
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.projects.R as ProjectsR
import cx.lpm.mobile.feature.projects.ui.SymbolGlyph

/**
 * A computer's name over its card in the projects list: its glyph, its name and a few
 * words on how it is doing.
 */
@Composable
fun ComputerHeaderLabel(
    linuxHost: Boolean,
    name: String,
    modifier: Modifier = Modifier,
    detail: String? = null
) {
    val colors = LpmTheme.colors
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        SymbolGlyph(
            painter = painterResource(
                if (linuxHost) R.drawable.ic_dns else R.drawable.ic_desktop_mac
            ),
            size = 22.dp,
            bounds = MachineGlyph,
            tint = colors.label
        )
        Text(
            text = name,
            style = LpmTheme.typography.subheadline.copy(fontWeight = FontWeight.SemiBold),
            color = colors.label,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false)
        )
        if (detail != null) {
            Text(
                text = detail,
                style = LpmTheme.typography.caption1,
                color = colors.secondaryLabel,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

/**
 * The header over a machine's card in the projects list: which machine it is and
 * whether it is on this phone yet. Tapping it opens or shuts the card; pairing it
 * with this phone lives in the list's "…" menu.
 */
@Composable
fun MachineHeader(
    entry: ProjectsListRow.MachineEntry,
    onToggle: () -> Unit,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
    onLongPress: (() -> Unit)? = null
) {
    val colors = LpmTheme.colors
    Row(
        modifier = modifier
            .fillMaxWidth()
            .combinedClickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
                onLongClick = onLongPress,
                onClick = onToggle
            ),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        ComputerHeaderLabel(
            linuxHost = entry.linuxHost,
            name = entry.name,
            detail = entry.detail?.let { machineDetailText(it) },
            modifier = Modifier.weight(1f, fill = false)
        )
        Spacer(Modifier.weight(1f))
        if (entry.opensOnlyBySwitching) {
            LinkButton(
                text = stringResource(ProjectsR.string.machine_section_open),
                onClick = onOpen,
                textStyle = LpmTheme.typography.subheadline.copy(fontWeight = FontWeight.SemiBold)
            )
        } else {
            if (entry.count != null) {
                Text(
                    text = entry.count.toString(),
                    style = LpmTheme.typography.caption1,
                    color = colors.secondaryLabel
                )
            }
            SymbolGlyph(
                painter = painterResource(
                    if (entry.expanded) {
                        R.drawable.ic_keyboard_arrow_down
                    } else {
                        R.drawable.ic_chevron_right
                    }
                ),
                size = 18.dp,
                bounds = DpSize(12.dp, 12.dp),
                tint = colors.secondaryLabel
            )
        }
    }
}

@Composable
private fun machineDetailText(detail: MachineDetail): String = when (detail) {
    MachineDetail.OpensThroughMac -> stringResource(ProjectsR.string.machine_section_through_mac)
    MachineDetail.Adding -> stringResource(ProjectsR.string.machine_section_adding)
    is MachineDetail.Failed -> detail.message
    MachineDetail.NotOnPhone -> stringResource(ProjectsR.string.machine_section_not_on_phone)
    MachineDetail.Revoked -> stringResource(ProjectsR.string.machine_section_revoked)
    MachineDetail.NeedsUpdate -> stringResource(ProjectsR.string.machine_section_needs_update)
    MachineDetail.Connecting -> stringResource(ProjectsR.string.machine_section_connecting)
    MachineDetail.NotAnswering -> stringResource(ProjectsR.string.mac_not_answering)
}

/** `server.rack` / `desktopcomputer` at the subheadline size. */
private val MachineGlyph = DpSize(18.dp, 16.dp)

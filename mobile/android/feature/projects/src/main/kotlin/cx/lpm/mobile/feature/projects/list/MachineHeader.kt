package cx.lpm.mobile.feature.projects.list

import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R
import cx.lpm.mobile.core.designsystem.component.LinkButton
import cx.lpm.mobile.core.designsystem.component.ListLeadingSlot
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.projects.R as ProjectsR
import cx.lpm.mobile.feature.projects.ui.SymbolGlyph

/**
 * The header of a machine's section in the projects list: which machine it is and
 * whether it is on this phone yet. Tapping it opens or shuts the section; pairing it
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
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val colors = LpmTheme.colors
    ListRow(
        modifier = modifier
            .combinedClickable(
                interactionSource = interaction,
                indication = null,
                role = Role.Button,
                onLongClick = onLongPress,
                onClick = onToggle
            )
            .background(if (pressed) colors.gray4 else Color.Transparent),
        leading = {
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
        },
        leadingSlot = ChevronSlot,
        trailing = {
            if (entry.opensOnlyBySwitching) {
                LinkButton(
                    text = stringResource(ProjectsR.string.machine_section_open),
                    onClick = onOpen,
                    textStyle = LpmTheme.typography.subheadline.copy(
                        fontWeight = FontWeight.SemiBold
                    )
                )
            } else if (entry.count != null) {
                Text(
                    text = entry.count.toString(),
                    style = LpmTheme.typography.caption1,
                    color = colors.secondaryLabel
                )
            }
        }
    ) {
        SymbolGlyph(
            painter = painterResource(
                if (entry.linuxHost) R.drawable.ic_dns else R.drawable.ic_desktop_mac
            ),
            size = 22.dp,
            bounds = MachineGlyph,
            tint = colors.secondaryLabel
        )
        Spacer(Modifier.width(8.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = entry.name,
                style = LpmTheme.typography.body.copy(fontWeight = FontWeight.Medium),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            entry.detail?.let {
                Text(
                    text = machineDetailText(it),
                    style = LpmTheme.typography.caption1,
                    color = colors.secondaryLabel
                )
            }
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

private val ChevronSlot = ListLeadingSlot(width = 12.dp, spacing = 8.dp)

/** `server.rack` / `desktopcomputer` at the subheadline size. */
private val MachineGlyph = DpSize(18.dp, 16.dp)

/** The separator under a header starts at the machine's name, past both glyphs. */
internal val MachineHeaderSeparatorInset = 16.dp + 12.dp + 8.dp + MachineGlyph.width + 8.dp

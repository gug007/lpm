package cx.lpm.mobile.feature.projects.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R
import cx.lpm.mobile.core.designsystem.component.CapsuleTag
import cx.lpm.mobile.core.designsystem.component.ContextMenu
import cx.lpm.mobile.core.designsystem.component.ContextMenuItem
import cx.lpm.mobile.core.designsystem.component.DisclosureChevron
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.component.SwipeAction
import cx.lpm.mobile.core.designsystem.component.SwipeActionsBox
import cx.lpm.mobile.core.designsystem.component.listSeparator
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.core.ui.AgentToneText
import cx.lpm.mobile.core.ui.EmojiLabel
import cx.lpm.mobile.feature.projects.R as ProjectsR
import cx.lpm.mobile.feature.projects.agents.AgentStatusTrail

/** The tab's name as its row shows it, led by the tab's emoji. */
val TerminalInfo.title: String get() = if (emoji.isEmpty()) label else "$emoji $label"

/**
 * The long press's items beyond Pin / Rename / Close, each null when the Mac or the
 * tab doesn't offer it, as the desktop's own tab menu wouldn't.
 */
class TabMenuExtras(
    val useTitle: (() -> Unit)? = null,
    val fork: (() -> Unit)? = null,
    val forkCopy: (() -> Unit)? = null,
    val closeOthers: (() -> Unit)? = null,
    val claudeAccount: (@Composable ColumnScope.() -> Unit)? = null
)

/**
 * One terminal tab in the project's list, read the way the desktop sidebar reads it:
 * the name carries the agent's state, and the trailing edge holds the state's mark
 * and how long it has been so. The desktop's tab actions live on swipes (Pin from
 * the leading edge, Rename and Close from the trailing one) and the long press.
 */
@Composable
fun TabRow(
    tab: TabEntry,
    onOpen: () -> Unit,
    onPin: () -> Unit,
    onRename: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
    extras: TabMenuExtras = TabMenuExtras()
) {
    val term = tab.terminal
    val agent = tab.agent
    val colors = LpmTheme.colors
    val pinLabel =
        stringResource(if (term.pinned) ProjectsR.string.tab_unpin else ProjectsR.string.tab_pin)
    val pinIcon = if (term.pinned) R.drawable.ic_keep_off else R.drawable.ic_keep
    val renameLabel = stringResource(ProjectsR.string.tab_rename)
    val closeLabel = stringResource(ProjectsR.string.tab_close)
    var menuOpen by remember { mutableStateOf(false) }
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val description = listOfNotNull(
        term.label,
        agent?.state?.label,
        agent?.elapsed(System.currentTimeMillis())
    ).joinToString(", ")
    SwipeActionsBox(
        modifier = modifier.listSeparator(),
        leading = listOf(SwipeAction(pinLabel, pinIcon, colors.orange, onPin)),
        trailing = listOf(
            SwipeAction(closeLabel, R.drawable.ic_close, colors.red, onClose),
            SwipeAction(renameLabel, R.drawable.ic_edit, colors.gray, onRename)
        )
    ) {
        ListRow(
            modifier = Modifier
                .combinedClickable(
                    interactionSource = interaction,
                    indication = null,
                    role = Role.Button,
                    onLongClick = { menuOpen = true },
                    onClick = onOpen
                )
                .background(if (pressed) colors.gray4 else Color.Transparent)
                .semantics { contentDescription = description },
            trailing = {
                if (term.remote) {
                    CapsuleTag(
                        text = stringResource(ProjectsR.string.tab_remote),
                        containerColor = colors.tertiarySystemFill,
                        textStyle = LpmTheme.typography.caption2.copy(
                            fontWeight = FontWeight.SemiBold
                        )
                    )
                    Spacer(Modifier.width(8.dp))
                }
                agent?.let {
                    AgentStatusTrail(it, style = LpmTheme.typography.subheadline)
                    Spacer(Modifier.width(8.dp))
                }
                DisclosureChevron()
            }
        ) {
            Row(
                modifier = Modifier.weight(1f),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                EmojiLabel(
                    emoji = term.emoji,
                    label = term.label,
                    fontSize = LpmTheme.typography.body.fontSize,
                    modifier = Modifier.weight(1f, fill = false)
                ) {
                    AgentToneText(text = it, state = agent?.state, style = LpmTheme.typography.body)
                }
                if (agent != null && agent.shared > 0) {
                    Text(
                        text = "+${agent.shared}",
                        style = LpmTheme.typography.caption1.copy(fontFeatureSettings = "tnum"),
                        color = colors.secondaryLabel
                    )
                }
                if (term.pinned) {
                    Icon(
                        painter = painterResource(R.drawable.ic_keep_fill),
                        contentDescription = null,
                        tint = colors.orange,
                        modifier = Modifier.size(13.dp)
                    )
                }
            }
        }
        Box {
            ContextMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                ContextMenuItem(title = pinLabel, onClick = onPin, icon = painterResource(pinIcon))
                ContextMenuItem(
                    title = renameLabel,
                    onClick = onRename,
                    icon = painterResource(R.drawable.ic_edit)
                )
                extras.useTitle?.let {
                    ContextMenuItem(
                        title = stringResource(ProjectsR.string.tab_use_title),
                        onClick = it,
                        icon = painterResource(R.drawable.ic_auto_awesome)
                    )
                }
                extras.fork?.let {
                    ContextMenuItem(
                        title = stringResource(ProjectsR.string.tab_fork),
                        onClick = it,
                        icon = painterResource(R.drawable.ic_fork_right)
                    )
                }
                extras.forkCopy?.let {
                    ContextMenuItem(
                        title = stringResource(ProjectsR.string.tab_fork_copy),
                        onClick = it,
                        icon = painterResource(R.drawable.ic_library_add)
                    )
                }
                extras.claudeAccount?.invoke(this)
                ContextMenuItem(
                    title = closeLabel,
                    onClick = onClose,
                    icon = painterResource(R.drawable.ic_close),
                    destructive = true
                )
                extras.closeOthers?.let {
                    ContextMenuItem(
                        title = stringResource(ProjectsR.string.tab_close_others),
                        onClick = it,
                        icon = painterResource(R.drawable.ic_cancel),
                        destructive = true
                    )
                }
            }
        }
    }
}

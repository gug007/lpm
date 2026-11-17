package cx.lpm.mobile.feature.projects.list

import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.data.link.QueuedAction
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ActivityIndicatorSize
import cx.lpm.mobile.core.designsystem.component.DisclosureChevron
import cx.lpm.mobile.core.designsystem.component.ListDefaults
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.component.StatusDot
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.model.crashedServices
import cx.lpm.mobile.core.model.isUp
import cx.lpm.mobile.feature.projects.R
import cx.lpm.mobile.feature.projects.detail.crashSummaryText

/**
 * A project in the list: its running dot (a spinner while a Start/Stop is out, red
 * for a config error), the status a person gave it, its name with the status's note
 * and any action waiting on the Mac under it, and how many terminals it has going.
 * A machine's project that can't be opened from here is grayed out ([enabled]).
 */
@Composable
fun ProjectRow(
    project: Project,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
    pending: Boolean = false,
    stale: Boolean = false,
    agentCount: Int = 0,
    indent: Dp = 0.dp,
    queued: List<QueuedAction> = emptyList(),
    onCancelAction: (String) -> Unit = {},
    onRetryAction: (String) -> Unit = {},
    onLongPress: (() -> Unit)? = null,
    enabled: Boolean = true
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    ListRow(
        modifier = modifier
            .combinedClickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                role = Role.Button,
                onLongClick = onLongPress,
                onClick = onOpen
            )
            .background(if (pressed) LpmTheme.colors.gray4 else Color.Transparent),
        leading = { ProjectStateDot(project, pending, stale) },
        leadingSlot = ListDefaults.DotSlot,
        indent = indent,
        trailing = {
            if (agentCount > 0) TerminalCount(agentCount)
            Spacer(Modifier.width(8.dp))
            DisclosureChevron()
        }
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = project.label,
                style = LpmTheme.typography.body,
                color = if (project.configError == null && enabled) {
                    LpmTheme.colors.label
                } else {
                    LpmTheme.colors.secondaryLabel
                }
            )
            project.workStatus?.let { WorkStatusLine(it) }
            queued.forEach { action ->
                QueuedActionLine(
                    action = action,
                    onCancel = { onCancelAction(action.id) },
                    onRetry = { onRetryAction(action.id) }
                )
            }
        }
    }
}

/** The 14 dp column in front of a project's name. */
@Composable
private fun ProjectStateDot(project: Project, pending: Boolean, stale: Boolean) {
    when {
        pending -> ActivityIndicator(size = ActivityIndicatorSize.Mini)

        project.configError != null -> {
            val label = stringResource(R.string.row_config_error)
            StatusDot(
                color = LpmTheme.colors.red,
                modifier = Modifier.semantics { contentDescription = label }
            )
        }

        else -> {
            val crashed = project.crashedServices
            RunningDot(
                running = project.isUp,
                stale = stale,
                crashed = if (crashed.isEmpty()) null else crashSummaryText(crashed)
            )
        }
    }
}

/**
 * The green (running) / gray (stopped) status dot; red when a service it started
 * crashed, labelled with which ([crashed], "web exited with code 1"). Last known
 * rather than live, a running project shows as a ring.
 */
@Composable
fun RunningDot(
    running: Boolean,
    modifier: Modifier = Modifier,
    size: Dp = 8.dp,
    stale: Boolean = false,
    crashed: String? = null
) {
    if (crashed != null && !stale) {
        StatusDot(
            color = LpmTheme.colors.red,
            modifier = modifier.semantics { contentDescription = crashed },
            size = size
        )
        return
    }
    StatusDot(
        color = if (running && !stale) LpmTheme.colors.green else LpmTheme.colors.secondaryLabel,
        modifier = modifier,
        size = size,
        hollow = stale && running
    )
}

@Composable
private fun TerminalCount(count: Int, modifier: Modifier = Modifier) {
    val label = pluralStringResource(R.plurals.row_terminals, count, count)
    Box(
        modifier = modifier
            .defaultMinSize(minWidth = 20.dp, minHeight = 20.dp)
            .background(LpmTheme.colors.tertiarySystemFill, CircleShape)
            .padding(horizontal = 6.dp)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = count.toString(),
            style = LpmTheme.typography.caption1.copy(
                fontWeight = FontWeight.SemiBold,
                fontFeatureSettings = "tnum"
            ),
            color = LpmTheme.colors.secondaryLabel
        )
    }
}

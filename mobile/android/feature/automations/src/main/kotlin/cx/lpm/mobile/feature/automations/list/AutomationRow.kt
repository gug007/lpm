package cx.lpm.mobile.feature.automations.list

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ActivityIndicatorSize
import cx.lpm.mobile.core.designsystem.component.CapsuleTag
import cx.lpm.mobile.core.designsystem.component.ContextMenu
import cx.lpm.mobile.core.designsystem.component.ContextMenuItem
import cx.lpm.mobile.core.designsystem.component.DisclosureChevron
import cx.lpm.mobile.core.designsystem.component.ListDefaults
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.component.StatusDot
import cx.lpm.mobile.core.designsystem.component.SwipeAction
import cx.lpm.mobile.core.designsystem.component.SwipeActionsBox
import cx.lpm.mobile.core.designsystem.component.listSeparator
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.automations.R as AutomationsR
import cx.lpm.mobile.feature.automations.ui.color

/**
 * One automation in the list: open on tap, Edit / Mark read / Turn off on a long
 * press, Run (Retry after a failed run) or Stop swiped from the right, Read or Turn
 * off from the left.
 */
@Composable
fun AutomationRow(
    row: AutomationRowUi,
    actions: AutomationsActions,
    modifier: Modifier = Modifier
) {
    val job = row.job
    var menuOpen by remember { mutableStateOf(false) }
    val colors = LpmTheme.colors
    val toggle = if (job.enabled) {
        SwipeAction(
            stringResource(AutomationsR.string.row_turn_off),
            R.drawable.ic_pause_fill,
            colors.orange
        ) { actions.toggleEnabled(job) }
    } else {
        SwipeAction(
            stringResource(AutomationsR.string.row_turn_on),
            R.drawable.ic_power_settings_new,
            colors.green
        ) { actions.toggleEnabled(job) }
    }
    val leading = if (row.unread) {
        SwipeAction(
            stringResource(AutomationsR.string.row_read),
            R.drawable.ic_drafts,
            colors.blue
        ) { actions.markRead(job) }
    } else {
        toggle
    }
    val trailing = when {
        job.running -> SwipeAction(
            stringResource(AutomationsR.string.row_stop),
            R.drawable.ic_stop_fill,
            colors.red
        ) { actions.stop(job) }

        job.enabled && row.failed -> SwipeAction(
            stringResource(AutomationsR.string.row_retry),
            R.drawable.ic_refresh,
            colors.blue
        ) { actions.run(job) }

        job.enabled -> SwipeAction(
            stringResource(AutomationsR.string.row_run),
            R.drawable.ic_play_arrow_fill,
            colors.blue
        ) { actions.run(job) }

        else -> null
    }
    SwipeActionsBox(
        modifier = modifier.listSeparator(startInset = TextInset),
        leading = listOf(leading),
        trailing = listOfNotNull(trailing)
    ) {
        AutomationRowContent(
            row = row,
            onOpen = { actions.open(job) },
            onLongPress = { menuOpen = true }
        )
        ContextMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
            ContextMenuItem(
                title = stringResource(AutomationsR.string.row_edit),
                onClick = { actions.edit(job) },
                icon = painterResource(R.drawable.ic_edit)
            )
            if (row.unread) {
                ContextMenuItem(
                    title = stringResource(AutomationsR.string.row_mark_read),
                    onClick = { actions.markRead(job) },
                    icon = painterResource(R.drawable.ic_drafts)
                )
            }
            ContextMenuItem(
                title = toggle.label,
                onClick = toggle.onClick,
                icon = painterResource(toggle.icon)
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun AutomationRowContent(
    row: AutomationRowUi,
    onOpen: () -> Unit,
    onLongPress: () -> Unit,
    modifier: Modifier = Modifier
) {
    val job = row.job
    val colors = LpmTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val dotLift = with(LocalDensity.current) { 4.dp.roundToPx() }
    ListRow(
        modifier = modifier
            .combinedClickable(
                interactionSource = interaction,
                indication = null,
                role = Role.Button,
                onLongClick = onLongPress,
                onClick = onOpen
            )
            .background(if (pressed) colors.gray4 else Color.Transparent),
        verticalPadding = 17.dp,
        trailing = {
            if (job.running) {
                Spacer(Modifier.width(4.dp))
                ActivityIndicator(size = ActivityIndicatorSize.Small)
            }
            Spacer(Modifier.width(8.dp))
            DisclosureChevron()
        }
    ) {
        Row(
            Modifier
                .weight(1f)
                .alpha(if (job.enabled) 1f else DISABLED_ALPHA),
            verticalAlignment = Alignment.CenterVertically
        ) {
            StatusDot(color = if (row.unread) colors.tint else Color.Transparent)
            Spacer(Modifier.width(10.dp))
            Box(Modifier.width(EmojiWidth), contentAlignment = Alignment.Center) {
                Text(text = row.emoji, style = LpmTheme.typography.title3)
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                TitleLine(row)
                // A failed run's reason gets a second line; the dot stays on the first.
                Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    StatusDot(
                        color = row.statusTone.color(),
                        size = 6.dp,
                        modifier = Modifier.alignBy { it.measuredHeight / 2 + dotLift }
                    )
                    Text(
                        text = row.status,
                        style = LpmTheme.typography.caption1,
                        color = if (job.valid) colors.secondaryLabel else colors.red,
                        maxLines = if (row.failed) 2 else 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.alignByBaseline()
                    )
                }
            }
        }
    }
}

/** The name, then where it runs and whether it lives in the repo. */
@Composable
private fun TitleLine(row: AutomationRowUi) {
    val colors = LpmTheme.colors
    Row(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = row.job.displayName,
            style = LpmTheme.typography.body.copy(
                fontWeight = if (row.unread) FontWeight.SemiBold else FontWeight.Medium
            ),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false)
        )
        if (row.scope.isNotEmpty()) {
            CapsuleTag(text = row.scope)
        }
        if (row.job.source == "repo") {
            Text(
                text = stringResource(AutomationsR.string.row_in_repo),
                style = LpmTheme.typography.caption2,
                color = colors.tertiaryLabel
            )
        }
    }
}

private val EmojiWidth = 28.dp

/** The separator starts under the emoji, the row's first text. */
private val TextInset = ListDefaults.RowPadding + 8.dp + 10.dp

private const val DISABLED_ALPHA = 0.6f

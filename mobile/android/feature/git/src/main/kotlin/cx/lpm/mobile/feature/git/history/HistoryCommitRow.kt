package cx.lpm.mobile.feature.git.history

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.component.DisclosureChevron
import cx.lpm.mobile.core.designsystem.component.PlainListDefaults
import cx.lpm.mobile.core.designsystem.component.plainListSeparator
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.CiCheck
import cx.lpm.mobile.core.model.HistoryCommit
import cx.lpm.mobile.core.model.relativeAgo
import cx.lpm.mobile.core.ui.AgentMark
import cx.lpm.mobile.core.ui.AgentMarkIcon
import cx.lpm.mobile.core.ui.CiStateIcon
import cx.lpm.mobile.feature.git.R

/**
 * One commit: its mark, what it says, who wrote it (and with which agent) and when,
 * "↑" while no remote has it, else how it did on CI. The [first] row carries the list's
 * top separator.
 */
@Composable
internal fun HistoryCommitRow(
    commit: HistoryCommit,
    ci: CiCheck.State?,
    now: Long,
    first: Boolean,
    separator: Boolean,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = LpmTheme.colors
    val caption = LpmTheme.typography.caption1
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    // iOS sets the mark's center 4 pt above the subject's first baseline.
    val markLift = with(LocalDensity.current) { MarkLift.roundToPx() }
    Row(
        modifier
            .plainListSeparator(
                colors.listSeparator,
                startInset = TextInset,
                top = first,
                bottom = separator
            )
            .fillMaxWidth()
            .clickable(interaction, indication = null, role = Role.Button, onClick = onOpen)
            .background(if (pressed) colors.gray4 else Color.Transparent)
            .padding(
                horizontal = PlainListDefaults.RowPadding,
                vertical = PlainListDefaults.RowInset + 2.dp
            ),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        CommitMark(commit, Modifier.alignBy { it.measuredHeight / 2 + markLift })
        Column(
            Modifier
                .weight(1f)
                .alignByBaseline(),
            verticalArrangement = Arrangement.spacedBy(3.dp)
        ) {
            Text(
                text = commit.subject,
                style = LpmTheme.typography.subheadline,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            Byline(commit)
        }
        Spacer(Modifier.width(6.dp))
        Column(
            Modifier.alignByBaseline(),
            horizontalAlignment = Alignment.End,
            verticalArrangement = Arrangement.spacedBy(3.dp)
        ) {
            Text(
                text = relativeAgo(commit.time, now),
                style = caption.copy(fontFeatureSettings = "tnum"),
                color = colors.secondaryLabel,
                maxLines = 1
            )
            if (commit.unpushed) {
                val spoken = stringResource(R.string.git_history_unpushed)
                Text(
                    text = stringResource(R.string.git_history_unpushed_mark),
                    style = caption.copy(fontWeight = FontWeight.SemiBold),
                    color = colors.cyan,
                    modifier = Modifier.clearAndSetSemantics { contentDescription = spoken }
                )
            } else if (ci != null) {
                val spoken = stringResource(ci.label)
                CiStateIcon(
                    ci,
                    Modifier.clearAndSetSemantics { contentDescription = spoken },
                    size = CiIconSize
                )
            }
        }
        DisclosureChevron(Modifier.align(Alignment.CenterVertically))
    }
}

/** The agent's mark, the author and the short hash under the subject. */
@Composable
private fun Byline(commit: HistoryCommit) {
    val colors = LpmTheme.colors
    val caption = LpmTheme.typography.caption1
    Row(
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        val agent = commit.agent
        val mark = agent?.let(AgentMark::of)
        if (agent != null && mark != null) {
            val credit = stringResource(
                R.string.git_history_with,
                commit.coAuthorNames.firstOrNull() ?: agent
            )
            AgentMarkIcon(
                mark,
                Modifier
                    .size(12.dp)
                    .clearAndSetSemantics { contentDescription = credit }
            )
        }
        Text(
            text = commit.author,
            style = caption,
            color = colors.secondaryLabel,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false)
        )
        Text(
            stringResource(R.string.git_history_separator),
            style = caption,
            color = colors.secondaryLabel
        )
        Text(
            text = commit.short,
            style = caption.copy(fontFamily = FontFamily.Monospace),
            color = colors.secondaryLabel,
            maxLines = 1
        )
    }
}

private val CiCheck.State.label: Int
    get() = when (this) {
        CiCheck.State.FAIL -> R.string.git_history_ci_failed
        CiCheck.State.PENDING -> R.string.git_history_ci_running
        CiCheck.State.PASS -> R.string.git_history_ci_passed
        CiCheck.State.SKIPPED -> R.string.git_history_ci_skipped
    }

private val MarkLift = 4.dp

private val CiIconSize = 14.dp

/** Where the separator starts: at the subject, past the mark's column. */
private val TextInset = PlainListDefaults.RowPadding + 12.dp + 10.dp

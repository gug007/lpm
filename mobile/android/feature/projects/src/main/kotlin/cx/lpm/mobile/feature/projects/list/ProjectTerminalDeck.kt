package cx.lpm.mobile.feature.projects.list

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.role
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R
import cx.lpm.mobile.core.designsystem.component.DisclosureChevron
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.ProjectAgentRow
import cx.lpm.mobile.core.ui.AgentToneText
import cx.lpm.mobile.feature.projects.R as ProjectsR
import cx.lpm.mobile.feature.projects.agents.AgentStatusTrail

/**
 * Every terminal a project has going, as one recessed card nested under the
 * project's own row and inset to start beneath its name — so a terminal reads as
 * part of the project above it rather than as another project beside it.
 *
 * From a Mac that archives agents ([actions] set), a finished row archives with a
 * swipe, its long-press menu marks it unread once seen (or seen, while the Mac keeps
 * finished agents), and the [folded] seen rows past the Mac's limit fold into one
 * line that expands in place.
 */
@Composable
fun ProjectTerminalDeck(
    rows: List<ProjectAgentRow>,
    onOpen: (ProjectAgentRow) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    folded: Int = 0,
    expanded: Boolean = false,
    onToggleFold: () -> Unit = {},
    actions: AgentRowActions? = null
) {
    val shape = RoundedCornerShape(10.dp)
    Column(
        modifier
            .clip(shape)
            .background(LpmTheme.colors.tertiarySystemGroupedBackground)
            .border(0.5.dp, LpmTheme.colors.separator.copy(alpha = 0.5f), shape)
    ) {
        rows.forEachIndexed { index, row ->
            key(row.id, row.seen) {
                if (index > 0) DeckRule()
                DeckAgentRow(
                    row = row,
                    onOpen = { onOpen(row) },
                    enabled = enabled && row.terminalId != null,
                    actions = actions
                )
            }
        }
        if (folded > 0) {
            if (rows.isNotEmpty()) DeckRule()
            SeenAgentsFoldLine(folded = folded, expanded = expanded, onToggle = onToggleFold)
        }
    }
}

@Composable
private fun DeckRule() {
    Box(
        Modifier
            .padding(start = 10.dp)
            .fillMaxWidth()
            .height(0.5.dp)
            .background(LpmTheme.colors.separator)
    )
}

/** One row of the deck, with its swipe and long-press menu when the Mac archives agents. */
@Composable
private fun DeckAgentRow(
    row: ProjectAgentRow,
    onOpen: () -> Unit,
    enabled: Boolean,
    actions: AgentRowActions?
) {
    var menuOpen by remember { mutableStateOf(false) }
    val archive = actions?.takeIf { row.state.isFinished }?.let { { it.archive(row) } }
    Box {
        val terminalRow = @Composable {
            ProjectTerminalRow(
                row = row,
                onOpen = onOpen,
                enabled = enabled,
                onLongPress = actions?.let { { menuOpen = true } },
                onArchive = archive
            )
        }
        if (archive !=
            null
        ) {
            ArchiveSwipe(onArchive = archive, content = terminalRow)
        } else {
            terminalRow()
        }
        if (actions != null) {
            AgentRowMenu(
                expanded = menuOpen,
                onDismiss = { menuOpen = false },
                row = row,
                onOpen = onOpen.takeIf { row.terminalId != null },
                actions = actions
            )
        }
    }
}

/** A swipe from the trailing edge archives the row, over a blue Archive mark. */
@Composable
private fun ArchiveSwipe(onArchive: () -> Unit, content: @Composable () -> Unit) {
    val state = rememberSwipeToDismissBoxState()
    SwipeToDismissBox(
        state = state,
        enableDismissFromStartToEnd = false,
        onDismiss = { onArchive() },
        backgroundContent = {
            if (state.dismissDirection == SwipeToDismissBoxValue.EndToStart) {
                Box(
                    Modifier
                        .fillMaxSize()
                        .background(LpmTheme.colors.blue)
                        .padding(end = 24.dp),
                    contentAlignment = Alignment.CenterEnd
                ) {
                    Icon(
                        painter = painterResource(R.drawable.ic_archive),
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(24.dp)
                    )
                }
            }
        }
    ) { content() }
}

/**
 * One terminal inside a project's deck: the tab's name carries the agent's state,
 * and the trailing edge holds the state's mark and how long it has been so. A seen
 * agent's row is gray.
 */
@Composable
fun ProjectTerminalRow(
    row: ProjectAgentRow,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onLongPress: (() -> Unit)? = null,
    onArchive: (() -> Unit)? = null
) {
    val description = listOfNotNull(
        row.title,
        row.state.label,
        stringResource(ProjectsR.string.agent_seen).takeIf { row.seen },
        row.elapsed(System.currentTimeMillis()),
        row.provider.takeIf { it != row.title }
    ).joinToString(", ")
    val archiveLabel = stringResource(ProjectsR.string.agent_archive)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .deckLine(
                enabled = enabled || onLongPress != null,
                onLongClick = onLongPress,
                onClick = { if (enabled) onOpen() }
            )
            .clearAndSetSemantics {
                contentDescription = description
                role = Role.Button
                if (onArchive != null) {
                    customActions = listOf(
                        CustomAccessibilityAction(archiveLabel) {
                            onArchive()
                            true
                        }
                    )
                }
            },
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            modifier = Modifier.weight(1f),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            AgentToneText(
                text = row.title,
                state = row.state,
                style = LpmTheme.typography.subheadline,
                modifier = Modifier.weight(1f, fill = false),
                seen = row.seen
            )
            if (row.shared > 0) {
                Text(
                    text = "+${row.shared}",
                    style = LpmTheme.typography.caption2.copy(fontFeatureSettings = "tnum"),
                    color = LpmTheme.colors.secondaryLabel
                )
            }
        }
        AgentStatusTrail(row, style = LpmTheme.typography.footnote)
        DisclosureChevron()
    }
}

/**
 * A deck line's touch: no ripple, the line grays while pressed as an iOS list row
 * highlights, and it stands at least 44 dp tall.
 */
@Composable
internal fun Modifier.deckLine(
    enabled: Boolean = true,
    onLongClick: (() -> Unit)? = null,
    onClick: () -> Unit
): Modifier {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    return combinedClickable(
        interactionSource = interaction,
        indication = null,
        enabled = enabled,
        role = Role.Button,
        onLongClick = onLongClick,
        onClick = onClick
    )
        .background(
            if (pressed) {
                LpmTheme.colors.gray4
            } else {
                LpmTheme.colors.tertiarySystemGroupedBackground
            }
        )
        .heightIn(min = 44.dp)
        .padding(horizontal = 10.dp, vertical = 8.dp)
}

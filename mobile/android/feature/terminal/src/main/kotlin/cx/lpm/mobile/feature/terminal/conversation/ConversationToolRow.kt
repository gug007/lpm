package cx.lpm.mobile.feature.terminal.conversation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.component.DisclosureChevron
import cx.lpm.mobile.core.designsystem.component.clickableNoIndication
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.ConversationItem
import cx.lpm.mobile.core.model.ConversationRow
import cx.lpm.mobile.core.model.ConversationTool
import cx.lpm.mobile.core.ui.pulseAlpha
import cx.lpm.mobile.feature.terminal.R

/**
 * One thing the agent did, on a line that opens to what it was given and what came
 * back. [nested] inside an opened run of reads and searches, which is the box around it.
 */
@Composable
internal fun ConversationToolRow(
    item: ConversationItem,
    tool: ConversationTool,
    live: Boolean,
    actions: ConversationActions,
    modifier: Modifier = Modifier,
    nested: Boolean = false
) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    val added = tool.added
    val removed = tool.removed
    // Once more when the call ends: it has more to show then.
    if (expanded) LaunchedEffect(item.id, tool.state) { actions.onLoadDetail(item) }
    StepBox(nested, modifier) {
        StepLine(
            expanded = expanded,
            spoken = spoken(tool),
            onClick = { expanded = !expanded },
            dot = { StepDot(tool.state, running = live && tool.isRunning) }
        ) {
            Text(
                text = words(tool),
                modifier = Modifier.weight(1f, fill = false),
                style = LpmTheme.typography.footnote,
                color = LpmTheme.colors.label,
                maxLines = if (expanded) Int.MAX_VALUE else 1,
                overflow = TextOverflow.Ellipsis
            )
            if (added != null && removed != null) ChangeCounts(added, removed)
        }
        if (expanded) ConversationToolDetail(actions.detail(item), tool.path, actions.onOpenPath)
    }
}

/** A run of reads and searches on one line, opening to each of them. */
@Composable
internal fun ConversationLookups(
    run: ConversationRow.Lookups,
    live: Boolean,
    actions: ConversationActions,
    modifier: Modifier = Modifier
) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    val running = run.running.takeIf { live }
    val label = lookupsLabel(run, running)
    StepBox(nested = false, modifier = modifier) {
        StepLine(
            expanded = expanded,
            spoken = label,
            onClick = { expanded = !expanded },
            dot = {
                StepDot(
                    if (run.failed) ConversationTool.State.Failed else ConversationTool.State.Done,
                    running = running != null
                )
            }
        ) {
            Text(
                text = label,
                modifier = Modifier.weight(1f, fill = false),
                style = LpmTheme.typography.footnote,
                color = LpmTheme.colors.secondaryLabel,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        if (expanded) {
            run.items.forEach { item ->
                item.tool?.let { ConversationToolRow(item, it, live, actions, nested = true) }
            }
        }
    }
}

private val ConversationTool.isRunning: Boolean get() = state == ConversationTool.State.Running

@Composable
private fun StepBox(
    nested: Boolean,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    Column(
        modifier
            .fillMaxWidth()
            .background(
                Color.White.copy(alpha = if (nested) 0f else 0.05f),
                RoundedCornerShape(10.dp)
            )
            .padding(
                horizontal = if (nested) 0.dp else 10.dp,
                vertical = if (nested) 2.dp else 7.dp
            ),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) { content() }
}

/** A step's line: its dot, its words, and a chevron that turns as it opens. */
@Composable
private fun StepLine(
    expanded: Boolean,
    spoken: String,
    onClick: () -> Unit,
    dot: @Composable () -> Unit,
    words: @Composable RowScope.() -> Unit
) {
    val state = stringResource(
        if (expanded) R.string.conversation_expanded else R.string.conversation_collapsed
    )
    Row(
        modifier = Modifier
            .clickableNoIndication(onClick)
            .clearAndSetSemantics {
                contentDescription = spoken
                stateDescription = state
            }
            .fillMaxWidth()
            .heightIn(min = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(7.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        dot()
        Row(
            Modifier.weight(1f),
            horizontalArrangement = Arrangement.spacedBy(7.dp),
            verticalAlignment = Alignment.CenterVertically
        ) { words() }
        DisclosureChevron(Modifier.rotate(if (expanded) 90f else 0f))
    }
}

/** How a call went: the desktop's blue while it runs, then green or red. */
@Composable
private fun StepDot(state: ConversationTool.State, running: Boolean) {
    val colors = LpmTheme.colors
    val color = when {
        running -> colors.blue

        state == ConversationTool.State.Failed -> colors.red

        state == ConversationTool.State.Done -> colors.green

        // Left without its result by an agent no longer at it.
        else -> colors.secondaryLabel
    }
    val pulse = if (running) pulseAlpha() else null
    Box(
        Modifier
            .size(7.dp)
            .graphicsLayer { alpha = pulse?.invoke() ?: 1f }
            .background(color, CircleShape)
    )
}

@Composable
private fun ChangeCounts(added: Int, removed: Int) {
    val style = LpmTheme.typography.footnote.copy(
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.SemiBold
    )
    Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        if (added > 0) Text("+$added", style = style, color = LpmTheme.colors.green)
        if (removed > 0) Text("−$removed", style = style, color = LpmTheme.colors.red)
    }
}

@Composable
private fun words(tool: ConversationTool): AnnotatedString {
    val colors = LpmTheme.colors
    return buildAnnotatedString {
        withStyle(SpanStyle(color = colors.secondaryLabel)) { append(tool.verb) }
        if (tool.subject.isNotEmpty()) {
            append(" ")
            val family = if (tool.code) FontFamily.Monospace else null
            withStyle(SpanStyle(fontFamily = family)) { append(tool.subject) }
        }
        if (tool.note.isNotEmpty()) {
            val failed = tool.state == ConversationTool.State.Failed
            withStyle(SpanStyle(color = if (failed) colors.red else colors.secondaryLabel)) {
                append(" · ${tool.note}")
            }
        }
    }
}

@Composable
private fun spoken(tool: ConversationTool): String {
    val added = tool.added
    val removed = tool.removed
    val changes = if (added != null && removed != null) {
        stringResource(R.string.conversation_changes, "$added", "$removed")
    } else {
        null
    }
    return listOfNotNull(
        listOf(tool.verb, tool.subject).filter { it.isNotEmpty() }.joinToString(" "),
        tool.note.ifEmpty { null },
        changes
    ).joinToString(", ")
}

/** "Read 3 files", "Searched twice", "Read 2 files, searched once". */
@Composable
private fun lookupsLabel(run: ConversationRow.Lookups, running: ConversationTool?): String {
    if (running != null) {
        return stringResource(
            if (running.isRead) R.string.conversation_reading else R.string.conversation_searching
        )
    }
    val searches = run.searches
    val times = when (searches) {
        1 -> stringResource(R.string.conversation_once)
        2 -> stringResource(R.string.conversation_twice)
        else -> stringResource(R.string.conversation_times, searches.toString())
    }
    if (run.reads == 0) return stringResource(R.string.conversation_searched, times)
    val read = pluralStringResource(R.plurals.conversation_read, run.reads, run.reads)
    if (searches == 0) return read
    return stringResource(R.string.conversation_read_searched, read, times)
}

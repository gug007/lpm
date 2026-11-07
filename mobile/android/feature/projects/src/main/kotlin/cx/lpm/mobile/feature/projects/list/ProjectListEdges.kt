package cx.lpm.mobile.feature.projects.list

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.model.AgentState
import cx.lpm.mobile.core.model.ProjectAgentRow
import cx.lpm.mobile.core.ui.pulseAlpha
import cx.lpm.mobile.core.ui.sweepProgress
import cx.lpm.mobile.core.ui.tint
import cx.lpm.mobile.core.ui.workingSweep
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Each agent past an end of the list, most urgent first. */
@Immutable
internal data class AgentsOutOfView(
    val above: List<AgentState> = emptyList(),
    val below: List<AgentState> = emptyList()
)

/** What the ends of the list speak up about, most urgent first. */
private val EdgeTones = listOf(AgentState.NeedsYou, AgentState.Error, AgentState.Working)

/**
 * What an agent's own line says, for its tab's other agents too: the ones still
 * going or waiting on someone. Finished agents stay out, as they do from a folded
 * folder on the desktop, and a row already looked at waits on nobody, however it
 * ended.
 */
internal val ProjectAgentRow.edgeStates: List<AgentState>
    get() = if (seen) emptyList() else (listOf(state) + shared).filter { it in EdgeTones }

/** One agent's piece of an end line, in pixels from the line's start. */
internal data class EdgePiece(val start: Float, val end: Float)

/**
 * Where each of [count] agents' pieces sits along a line [width] long: equal pieces
 * [gap] apart, three times that after every fifth so a long run still reads in
 * fives, on whole pixels so the gaps stay sharp. Pieces that no longer fit are left
 * off.
 */
internal fun edgeLinePieces(count: Int, width: Float, gap: Float): List<EdgePiece> {
    if (count <= 0) return emptyList()
    val wide = gap * 3
    val gaps = (count - 1) * gap + (count - 1) / 5 * (wide - gap)
    val unit = max((width - gaps) / count, gap)
    val pieces = mutableListOf<EdgePiece>()
    var position = 0f
    for (piece in 1..count) {
        val start = position.roundToInt().toFloat()
        if (start >= width) break
        position += unit
        pieces += EdgePiece(start, min(position.roundToInt().toFloat(), width))
        position += if (piece % 5 == 0) wide else gap
    }
    return pieces
}

/** Where the list's agents sit in its scrolled column, and what each is doing. */
@Stable
class AgentEdgeRows {
    private val states = mutableStateMapOf<String, List<AgentState>>()
    private val middles = mutableStateMapOf<String, Float>()

    /** The column that scrolls, which every row is measured against. */
    internal var content: LayoutCoordinates? = null

    internal fun setStates(key: String, agents: List<AgentState>) {
        if (agents.isEmpty()) states.remove(key) else states[key] = agents
    }

    internal fun place(key: String, row: LayoutCoordinates) {
        val column = content?.takeIf { it.isAttached } ?: return
        placeAt(key, column.localBoundingBoxOf(row, clipBounds = false).center.y)
    }

    internal fun placeAt(key: String, middle: Float) {
        if (middles[key] != middle) middles[key] = middle
    }

    internal fun remove(key: String) {
        states.remove(key)
        middles.remove(key)
    }

    /** A row counts as gone once less than half of it shows. */
    internal fun outOfView(scroll: Int, viewport: Int): AgentsOutOfView {
        val above = mutableListOf<AgentState>()
        val below = mutableListOf<AgentState>()
        for ((key, agents) in states) {
            val middle = middles[key] ?: continue
            when {
                middle < scroll -> above += agents
                middle > scroll + viewport -> below += agents
            }
        }
        above.sortBy { it.rank }
        below.sortBy { it.rank }
        return AgentsOutOfView(above, below)
    }
}

/** Reports [content]'s place in the list, standing for the agents in [states]. */
@Composable
internal fun AgentEdgeRow(
    rows: AgentEdgeRows,
    key: String,
    states: List<AgentState>,
    content: @Composable () -> Unit
) {
    DisposableEffect(rows, key) { onDispose { rows.remove(key) } }
    DisposableEffect(rows, key, states) {
        rows.setStates(key, states)
        onDispose { }
    }
    Box(Modifier.onGloballyPositioned { rows.place(key, it) }) { content() }
}

/** A line along whichever end of the list has agents past it, a piece for each. */
@Composable
internal fun AgentEdgeLines(
    rows: AgentEdgeRows,
    scroll: ScrollState,
    modifier: Modifier = Modifier
) {
    val edges by remember(rows, scroll) {
        derivedStateOf { rows.outOfView(scroll.value, scroll.viewportSize) }
    }
    Box(modifier.fillMaxSize()) {
        AgentEdgeLine(edges.above, Modifier.align(Alignment.TopCenter))
        AgentEdgeLine(edges.below, Modifier.align(Alignment.BottomCenter))
    }
}

@Composable
private fun AgentEdgeLine(states: List<AgentState>, modifier: Modifier = Modifier) {
    AnimatedVisibility(
        visible = states.isNotEmpty(),
        modifier = modifier.fillMaxWidth(),
        enter = fadeIn(tween(LINE_FADE_MS)),
        exit = ExitTransition.None
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .height(LINE_HEIGHT)
        ) {
            for (tone in states.distinct()) key(tone) { AgentEdgeRun(tone, states) }
        }
    }
}

/** [state]'s pieces of a line split for each agent in [states], drawn as one so they sweep and pulse together. */
@Composable
private fun AgentEdgeRun(state: AgentState, states: List<AgentState>) {
    val tone = when (state) {
        AgentState.Working -> Modifier.workingSweep(sweepProgress())

        AgentState.NeedsYou -> {
            val alpha = pulseAlpha()
            Modifier.graphicsLayer { this.alpha = alpha() }
        }

        else -> Modifier
    }
    val color = if (state == AgentState.Working) Color.White else state.tint
    Spacer(
        tone
            .fillMaxSize()
            .drawWithCache {
                val pieces = edgeLinePieces(
                    states.size,
                    size.width,
                    PIECE_GAP.roundToPx().toFloat()
                )
                    .filterIndexed { index, _ -> states[index] == state }
                onDrawBehind {
                    for (piece in pieces) {
                        drawRect(
                            color,
                            Offset(piece.start, 0f),
                            Size(piece.end - piece.start, size.height)
                        )
                    }
                }
            }
    )
}

private const val LINE_FADE_MS = 160
private val LINE_HEIGHT = 2.dp
private val PIECE_GAP = 2.dp

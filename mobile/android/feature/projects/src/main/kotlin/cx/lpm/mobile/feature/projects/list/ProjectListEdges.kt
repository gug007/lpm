package cx.lpm.mobile.feature.projects.list

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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

/** The most urgent agent past each end of the list. */
@Immutable
internal data class AgentsOutOfView(val above: AgentState? = null, val below: AgentState? = null)

/**
 * The most urgent agent still going or waiting on someone. Finished agents stay out,
 * as they do from a folded folder on the desktop.
 */
internal fun edgeState(states: Iterable<AgentState>): AgentState? = states
    .filter { it == AgentState.NeedsYou || it == AgentState.Error || it == AgentState.Working }
    .minByOrNull { it.rank }

/** What an agent's own line says. A row already looked at waits on nobody, however it ended. */
internal val ProjectAgentRow.edgeState: AgentState?
    get() = if (seen) null else edgeState(listOf(state))

/** Where the list's agents sit in its scrolled column, and what each is doing. */
@Stable
class AgentEdgeRows {
    private val states = mutableStateMapOf<String, AgentState>()
    private val middles = mutableStateMapOf<String, Float>()

    /** The column that scrolls, which every row is measured against. */
    internal var content: LayoutCoordinates? = null

    internal fun setState(key: String, state: AgentState?) {
        if (state == null) states.remove(key) else states[key] = state
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
        for ((key, state) in states) {
            val middle = middles[key] ?: continue
            when {
                middle < scroll -> above += state
                middle > scroll + viewport -> below += state
            }
        }
        return AgentsOutOfView(edgeState(above), edgeState(below))
    }
}

/** Reports [content]'s place in the list, standing for [state] while that has anything to say. */
@Composable
internal fun AgentEdgeRow(
    rows: AgentEdgeRows,
    key: String,
    state: AgentState?,
    content: @Composable () -> Unit
) {
    DisposableEffect(rows, key) { onDispose { rows.remove(key) } }
    DisposableEffect(rows, key, state) {
        rows.setState(key, state)
        onDispose { }
    }
    Box(Modifier.onGloballyPositioned { rows.place(key, it) }) { content() }
}

/** A line along whichever end of the list has an agent past it, in that agent's tone. */
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
private fun AgentEdgeLine(state: AgentState?, modifier: Modifier = Modifier) {
    AnimatedVisibility(
        visible = state != null,
        modifier = modifier.fillMaxWidth(),
        enter = fadeIn(tween(LINE_FADE_MS)),
        exit = ExitTransition.None
    ) {
        if (state != null) AgentEdgeTone(state)
    }
}

@Composable
private fun AgentEdgeTone(state: AgentState) {
    val tone = when (state) {
        AgentState.Working -> Modifier.workingSweep(sweepProgress())

        AgentState.NeedsYou -> {
            val alpha = pulseAlpha()
            Modifier.graphicsLayer { this.alpha = alpha() }
        }

        else -> Modifier
    }
    Box(
        tone
            .fillMaxWidth()
            .height(2.dp)
            .background(if (state == AgentState.Working) Color.White else state.tint)
    )
}

private const val LINE_FADE_MS = 160

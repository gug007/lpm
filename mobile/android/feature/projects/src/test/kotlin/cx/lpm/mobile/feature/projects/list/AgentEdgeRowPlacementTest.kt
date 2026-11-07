package cx.lpm.mobile.feature.projects.list

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onPlaced
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.model.AgentState
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class AgentEdgeRowPlacementTest {
    @get:Rule
    val compose = createComposeRule()

    private val rows = AgentEdgeRows()
    private lateinit var scroll: ScrollState
    private var firstStates by mutableStateOf(listOf(AgentState.Working))
    private var lastShown by mutableStateOf(true)

    private fun show() = compose.setContent {
        scroll = rememberScrollState()
        Box(Modifier.size(200.dp, 300.dp)) {
            Column(
                Modifier
                    .verticalScroll(scroll)
                    .onPlaced { rows.content = it }
                    .padding(top = 40.dp)
            ) {
                AgentEdgeRow(rows, "first", firstStates) { Row() }
                Box(Modifier.height(2_000.dp))
                if (lastShown) AgentEdgeRow(rows, "last", listOf(AgentState.NeedsYou)) { Row() }
                Box(Modifier.height(1_000.dp))
            }
        }
    }

    @Composable
    private fun Row() = Box(
        Modifier
            .fillMaxWidth()
            .height(50.dp)
    )

    private fun edges() = compose.runOnIdle { rows.outOfView(scroll.value, scroll.viewportSize) }

    private fun scrollTo(fraction: Float) {
        compose.runOnIdle {
            runBlocking { scroll.scrollTo((scroll.maxValue * fraction).toInt()) }
        }
        compose.waitForIdle()
    }

    @Test
    fun `rows read against the scroll, whichever way the list has moved`() {
        show()
        assertEquals(AgentsOutOfView(below = listOf(AgentState.NeedsYou)), edges())

        scrollTo(0.2f)
        assertEquals(
            AgentsOutOfView(
                above = listOf(AgentState.Working),
                below = listOf(AgentState.NeedsYou)
            ),
            edges()
        )

        scrollTo(1f)
        assertEquals(
            AgentsOutOfView(above = listOf(AgentState.NeedsYou, AgentState.Working)),
            edges()
        )
    }

    @Test
    fun `a state change reaches the line without the row moving`() {
        show()
        scrollTo(0.2f)

        firstStates = listOf(AgentState.Error)
        assertEquals(listOf(AgentState.Error), edges().above)

        firstStates = emptyList()
        assertEquals(emptyList<AgentState>(), edges().above)
    }

    @Test
    fun `a row leaving the list stops counting`() {
        show()
        lastShown = false
        assertEquals(AgentsOutOfView(), edges())
    }
}

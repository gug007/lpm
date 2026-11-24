package cx.lpm.mobile.feature.terminal.conversation

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.data.conversation.ConversationDetail
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ActivityIndicatorSize
import cx.lpm.mobile.core.designsystem.component.CapsuleButton
import cx.lpm.mobile.core.designsystem.component.EmptyState
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.AgentDialogOption
import cx.lpm.mobile.core.model.ConversationItem
import cx.lpm.mobile.feature.terminal.R

/** What a conversation's rows do. */
@Stable
internal class ConversationActions(
    val onLoadEarlier: () -> Unit = {},
    val onLoadDetail: (ConversationItem) -> Unit = {},
    val detail: (ConversationItem) -> ConversationDetail? = { null },
    val onOpenPath: (String) -> Unit = {},
    val onShowTerminal: () -> Unit = {},
    val onPick: (AgentDialogOption) -> Unit = {}
)

/**
 * An agent tab as a conversation instead of a terminal: what was asked, what the agent
 * said, and a line for each thing it did. It covers the terminal, which stays live
 * underneath, so the composer below goes on sending to the same tab.
 */
@Composable
internal fun ConversationScreen(
    state: ConversationUiState,
    background: Color,
    actions: ConversationActions,
    modifier: Modifier = Modifier
) {
    // A touch between the rows isn't one for the terminal underneath.
    Box(modifier.fillMaxSize().background(background).pointerInput(Unit) { detectTapGestures {} }) {
        if (state.isEmpty) {
            Placeholder(state, Modifier.align(Alignment.Center))
        }
        Rows(state, actions)
    }
}

/**
 * Laid out from the end up, so a list at its end stays there as it grows and one
 * scrolled back to read stays where it is, earlier entries included.
 */
@Composable
private fun Rows(state: ConversationUiState, actions: ConversationActions) {
    val list = rememberLazyListState()
    LaunchedEffect(state.sending.size) {
        if (state.sending.isNotEmpty()) list.animateScrollToItem(0)
    }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        state = list,
        reverseLayout = true,
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp, Alignment.Top)
    ) {
        // What the list is held by while it's at its end.
        item(key = "end") { Spacer(Modifier.height(1.dp)) }
        state.agent?.let { agent ->
            item(key = "status") { ConversationStatus(agent, state.ask, actions) }
        }
        items(state.sending.asReversed(), key = { "sending:${it.id}" }) {
            ConversationPendingPrompt(it.text, queued = state.working)
        }
        items(state.rows.asReversed(), key = { it.id }) { row ->
            ConversationRowView(row, live = state.live, actions = actions)
        }
        if (state.more) {
            item(key = "earlier") {
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    CapsuleButton(
                        text = stringResource(R.string.conversation_show_earlier),
                        onClick = actions.onLoadEarlier,
                        enabled = !state.loadingEarlier && state.connected,
                        color = Color.White,
                        leading = if (state.loadingEarlier) {
                            { ActivityIndicator(size = ActivityIndicatorSize.Small) }
                        } else {
                            null
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun Placeholder(state: ConversationUiState, modifier: Modifier = Modifier) {
    val error = state.error
    when {
        error != null -> EmptyState(
            title = stringResource(R.string.conversation_error),
            icon = painterResource(DesignR.drawable.ic_warning),
            modifier = modifier,
            description = { PlaceholderText(error) }
        )

        state.loaded -> EmptyState(
            title = stringResource(R.string.conversation_empty),
            icon = painterResource(DesignR.drawable.ic_chat_bubble),
            modifier = modifier,
            description = { PlaceholderText(stringResource(R.string.conversation_empty_detail)) }
        )

        state.connected -> ActivityIndicator(modifier)
    }
}

@Composable
private fun PlaceholderText(text: String) {
    Text(
        text = text,
        style = LpmTheme.typography.subheadline,
        color = LpmTheme.colors.secondaryLabel,
        textAlign = TextAlign.Center
    )
}

package cx.lpm.mobile.feature.terminal.conversation

import androidx.compose.runtime.Immutable
import cx.lpm.mobile.core.data.conversation.ConversationDetail
import cx.lpm.mobile.core.data.conversation.PendingPrompt
import cx.lpm.mobile.core.model.AgentState
import cx.lpm.mobile.core.model.ConversationRow
import cx.lpm.mobile.core.model.ProjectAgentRow
import cx.lpm.mobile.core.ui.AgentAsk

@Immutable
data class ConversationUiState(
    val rows: List<ConversationRow> = emptyList(),
    /** There are entries before the first one. */
    val more: Boolean = false,
    val loadingEarlier: Boolean = false,
    /** The Mac has sent the conversation at least once. */
    val loaded: Boolean = false,
    val error: String? = null,
    val sending: List<PendingPrompt> = emptyList(),
    /** Opened tool calls, by the store's key for them. */
    val details: Map<String, ConversationDetail> = emptyMap(),
    /** The tab's agent, when it's up to something. */
    val agent: ProjectAgentRow? = null,
    /** The question a waiting agent asks, once the Mac has read one. */
    val ask: AgentAsk? = null,
    val connected: Boolean = true
) {
    val working: Boolean get() = agent?.state == AgentState.Working

    /** The agent is still at it, so a call without its result is one going on now. */
    val live: Boolean get() = working || agent?.state == AgentState.NeedsYou

    val isEmpty: Boolean get() = rows.isEmpty() && sending.isEmpty()
}

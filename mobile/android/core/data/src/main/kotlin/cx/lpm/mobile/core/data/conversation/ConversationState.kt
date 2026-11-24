package cx.lpm.mobile.core.data.conversation

import cx.lpm.mobile.core.model.ConversationItem
import cx.lpm.mobile.core.model.ConversationPart
import cx.lpm.mobile.core.model.ConversationUpdate

/** One terminal's conversation as the phone has it. */
data class ConversationList(
    val items: List<ConversationItem> = emptyList(),
    /** There are entries before the first one. */
    val more: Boolean = false,
    /** The Mac has sent it at least once. */
    val loaded: Boolean = false,
    val error: String? = null,
    val loadingEarlier: Boolean = false,
    /** Prompts sent from here the transcript doesn't have yet, oldest first. */
    val sending: List<PendingPrompt> = emptyList()
) {
    /** The list once the Mac's [update] is in it. */
    fun with(update: ConversationUpdate): ConversationList = when {
        update.error != null -> copy(error = update.error)
        update.reset -> reset(update).copy(error = null, loaded = true)
        else -> apply(update.items).copy(error = null, loaded = true)
    }

    /**
     * A whole list. What was scrolled back to stays when the list goes on from it;
     * anything else is another conversation.
     */
    private fun reset(update: ConversationUpdate): ConversationList {
        val first = update.items.firstOrNull()?.id
        val head = items.indexOfFirst { it.id == first }
        return if (head > 0) {
            copy(items = items.take(head) + update.items, sending = emptyList())
        } else {
            copy(items = update.items, more = update.more, sending = emptyList())
        }
    }

    /** Entries that changed, and new ones. */
    private fun apply(changed: List<ConversationItem>): ConversationList {
        val next = items.toMutableList()
        var waiting = sending
        for (item in changed) {
            val at = next.indexOfLast { it.id == item.id }
            if (at >= 0) {
                next[at] = item
            } else {
                next += item
                if (item.isPrompt) waiting = waiting.drop(1)
            }
        }
        return copy(items = next, sending = waiting)
    }
}

/** A prompt on its way to the agent. */
data class PendingPrompt(val id: String, val text: String)

/** What a tool call's opened line shows. */
sealed interface ConversationDetail {
    data object Loading : ConversationDetail
    data class Parts(val parts: List<ConversationPart>) : ConversationDetail
    data class Failed(val error: String) : ConversationDetail
}

data class ConversationState(
    val lists: Map<String, ConversationList> = emptyMap(),
    /** Opened tool calls, by [ConversationStore.detailKey]. */
    val details: Map<String, ConversationDetail> = emptyMap()
)

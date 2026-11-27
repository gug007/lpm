package cx.lpm.mobile.core.data.push

/**
 * The answers a notification can send back to the agent it is about, as the Mac
 * offers them in the alert's `actions` (iOS `AgentAnswerAction`, PROTOCOL.md
 * "Answering from a notification").
 */
enum class AgentAnswerAction(val wire: String) {
    Allow("allow"),
    Deny("deny"),
    Reply("reply")
    ;

    companion object {
        fun of(wire: String?): AgentAnswerAction? = entries.firstOrNull { it.wire == wire }

        /**
         * The buttons a payload's `actions` show: Allow and Deny together for a plain
         * permission prompt, else Reply; none for anything else.
         */
        fun offered(actions: List<String>): List<AgentAnswerAction> {
            val offered = actions.mapNotNull(::of).toSet()
            return when {
                offered.containsAll(listOf(Allow, Deny)) -> listOf(Allow, Deny)
                Reply in offered -> listOf(Reply)
                else -> emptyList()
            }
        }
    }
}

/**
 * One answer to an alert's report: the Mac types it in only while that same
 * report (`key`, `terminalId`, `ts`) still stands. `serverId` names the Mac. An
 * Allow names the dialog the notification showed and the choice it named
 * (`dialog`, `option`), so Enter lands only while that choice is highlighted.
 */
data class AgentAnswer(
    val serverId: String?,
    val project: String,
    val terminalId: String,
    val key: String,
    val ts: Long,
    val action: AgentAnswerAction,
    val text: String? = null,
    val dialog: String? = null,
    val option: String? = null
)

/** How sending an answer went. */
sealed interface AnswerOutcome {
    data object Sent : AnswerOutcome

    /** The Mac turned it down; `error` is its sentence for the user. */
    data class Refused(val error: String) : AnswerOutcome

    /** No answer from the Mac in time. */
    data class Unreachable(val macName: String?) : AnswerOutcome

    /** The alert's Mac isn't saved on this phone any more. */
    data object UnknownMac : AnswerOutcome
}

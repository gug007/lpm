package cx.lpm.mobile.core.model

/**
 * A turn that stopped beside background shells: the agent sits idle until one of
 * them ends and wakes it, though its status still says running. Mirrors the
 * desktop's agentPause.ts.
 */
data class AgentPause(
    /** Millis: when the turn stopped. */
    val since: Long,
    /** What each shell is doing, in the agent's words. */
    val shells: List<String>
) {
    /** "1 shell", "2 shells": the words Claude's own screen uses. */
    val shellsLabel: String get() = if (shells.size == 1) "1 shell" else "${shells.size} shells"

    companion object {
        const val LABEL = "Paused"
    }
}

val StatusEntry.pause: AgentPause?
    get() = if (value == "Running" && pausedAt > 0 && shells.isNotEmpty()) {
        AgentPause(pausedAt, shells)
    } else {
        null
    }

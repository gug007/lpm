package cx.lpm.mobile.core.data.terminals

import cx.lpm.mobile.core.model.ControlOwner
import cx.lpm.mobile.core.model.HistoryRow
import cx.lpm.mobile.core.model.LimitStop
import cx.lpm.mobile.core.model.MentionComputer
import cx.lpm.mobile.core.model.MentionEntry
import cx.lpm.mobile.core.model.SlashCommand
import cx.lpm.mobile.core.model.TerminalInfo

/**
 * How a terminal ended: its process exited with `code`, or the Mac no longer has it
 * at all (lpm restarted, or the exit itself never reached the phone).
 */
data class TerminalEnding(
    val code: Int,
    val gone: Boolean,
    /**
     * The tab's name and place in its project's list when it ended, to find the tab
     * lpm reopens in its place.
     */
    val label: String? = null,
    val index: Int? = null,
    /** Millis. */
    val at: Long = 0,
    /**
     * The link dropped right after it ended: lpm quit under it, rather than its
     * process exiting on its own.
     */
    val restarted: Boolean = false,
    /** This phone asked lpm to run it again in its tab, which comes back under a new id. */
    val restarting: Boolean = false
) {
    /**
     * lpm no longer has the tab, or is running it again, so the tab now in its place
     * can stand in for it.
     */
    val replaceable: Boolean get() = gone || restarted || restarting

    val message: String
        get() = when {
            restarted -> "Closed when lpm restarted"
            gone -> "This terminal is no longer running"
            code == 0 -> "Process exited"
            else -> "Process exited with code $code"
        }
}

/** A tab closed on this phone that can still be brought back, and where it sat. */
data class PendingTabClose(val tab: TerminalInfo, val index: Int)

data class TerminalsState(
    /** project → its terminals, in the desktop's tab order. */
    val terminals: Map<String, List<TerminalInfo>> = emptyMap(),
    /** terminal id → its slash commands. */
    val slashCommands: Map<String, List<SlashCommand>> = emptyMap(),
    /** project → @-mention targets. */
    val mentions: Map<String, List<MentionEntry>> = emptyMap(),
    /** project → the other computers an agent there can reach, for the @-mention menu. */
    val mentionComputers: Map<String, List<MentionComputer>> = emptyMap(),
    /** project → recently sent prompts (drafts left out). */
    val history: Map<String, List<HistoryRow>> = emptyMap(),
    /**
     * terminal id → who renders it live. Absent = nobody/unknown, so this phone may
     * show it; when the desktop or another phone owns it, this one shows a
     * "take control" placeholder.
     */
    val controlOwner: Map<String, ControlOwner> = emptyMap(),
    /** terminal id → how it ended, for screens still showing its last output. */
    val endedTerminals: Map<String, TerminalEnding> = emptyMap(),
    /** Projects with a new terminal or run action in flight: show a placeholder row. */
    val creatingTerminals: Set<String> = emptySet(),
    /**
     * A tab closed on this phone that can still be undone: hidden here, not yet
     * closed on the Mac. One at a time; the next close sends this one on.
     */
    val pendingTabClose: PendingTabClose? = null,
    /**
     * terminal id → the Claude account name this phone asked it to move to, until the
     * Mac lists the move.
     */
    val accountMoves: Map<String, String> = emptyMap(),
    /**
     * terminal id → the limit stop its bar showed when put away here; a later stop on the
     * same tab shows again.
     */
    val dismissedLimitStops: Map<String, LimitStop> = emptyMap()
) {
    /** project → terminal id → tab name, for naming agent rows. */
    val terminalTitles: Map<String, Map<String, String>>
        get() = terminals.mapValues { (_, list) -> list.associate { it.id to it.label } }
}

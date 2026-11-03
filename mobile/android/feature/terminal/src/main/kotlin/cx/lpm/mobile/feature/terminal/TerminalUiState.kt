package cx.lpm.mobile.feature.terminal

import cx.lpm.mobile.core.data.link.LinkStatusLine
import cx.lpm.mobile.core.data.terminals.TerminalEnding
import cx.lpm.mobile.core.model.AgentState
import cx.lpm.mobile.core.model.GitSnapshot
import cx.lpm.mobile.core.model.LimitStop
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.feature.terminal.settings.TerminalLook

data class TerminalUiState(
    val terminal: TerminalInfo? = null,
    val project: Project? = null,
    /** The project's terminal list has arrived: a missing terminal is gone, not loading. */
    val listLoaded: Boolean = false,
    /** This phone renders the terminal live; otherwise "take control" shows. */
    val controlled: Boolean = true,
    val ownerLabel: String = "",
    val ended: TerminalEnding? = null,
    /** The project's list still holds the terminal: the Mac has its tab. */
    val listed: Boolean = false,
    /** The Mac runs an ended terminal again in its tab. */
    val canRestart: Boolean = false,
    /** lpm restarted and this is the tab it reopened in the old one's place: say so for a moment. */
    val reopened: Boolean = false,
    /** The Claude account the tab's conversation is moving to, while it moves: covers the terminal. */
    val accountMove: String? = null,
    /** The usage limit the tab's Claude turn stopped at, while the Mac lists it. */
    val limitStop: LimitStop? = null,
    /** The Mac can move the tab's conversation to another of its Claude accounts. */
    val canSwitchAccount: Boolean = false,
    val connectionReady: Boolean = true,
    /** Replaces the agent's timing under the title while the Mac isn't connected. */
    val statusLine: LinkStatusLine? = null,
    val look: TerminalLook = TerminalLook(),
    /** How long the tab's agent has been at it; null for a plain shell. */
    val agent: AgentTiming? = null,
    /** The project's working tree, for the title's changes line; null until it loads. */
    val git: GitSnapshot? = null,
    /** The project's snapshot is on its way. */
    val gitLoading: Boolean = false,
    /** Changes on a Mac switch, when a missing terminal is asked for again. */
    val activeMacId: String? = null
) {
    /** The composer shows for a terminal this phone drives and whose process lives. */
    val showsComposer: Boolean get() = controlled && ended == null

    /** The limit bar above the composer, for a tab still running and not on its way elsewhere. */
    val shownLimitStop: LimitStop? get() = limitStop?.takeIf {
        ended == null && accountMove == null
    }

    /** How it ended, while the Mac still has its tab to run again or close from here. */
    val endedHere: TerminalEnding? get() = ended?.takeIf {
        !it.restarted && listed &&
            accountMove == null
    }
}

/**
 * What the tab's agent is doing, and in millis when its reading counts from and
 * when it froze once the turn ended.
 */
data class AgentTiming(val state: AgentState, val since: Long, val until: Long?)

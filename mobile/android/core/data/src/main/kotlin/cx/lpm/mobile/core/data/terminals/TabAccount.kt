package cx.lpm.mobile.core.data.terminals

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.dismissLimitStop
import cx.lpm.mobile.core.data.client.switchTerminalAccount
import cx.lpm.mobile.core.model.ClaudeAccountInfo
import cx.lpm.mobile.core.model.LimitStop
import cx.lpm.mobile.core.model.TerminalInfo
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/*
 * The tab menu's Claude Account: continuing a Claude tab's conversation on another of
 * the Mac's accounts, as the desktop's tab menu does.
 */

/** How long a move this phone asked for covers the tab before the Mac lists it. */
private const val ACCOUNT_MOVE_WAIT_MS = 10_000L

/** The Mac moves tabs between Claude accounts (`tabAccount`). */
val TerminalsStore.canSwitchTabAccounts: Boolean
    get() = client?.hostFeatures?.contains(LpmClient.TAB_ACCOUNT_FEATURE) == true

/**
 * Continue the tab's conversation on [account]. The tab is covered at once, and for as
 * long as the Mac lists it moving. False when nothing was sent.
 */
fun TerminalsStore.switchTerminalAccount(term: TerminalInfo, account: ClaudeAccountInfo): Boolean =
    switchTerminalAccount(term, account.id, account.label)

fun TerminalsStore.switchTerminalAccount(
    term: TerminalInfo,
    account: String,
    label: String
): Boolean {
    if (!canSwitchTabAccounts || !term.canSwitchAccount || account == term.claudeAccount) {
        return false
    }
    setAccountMove(term.id, label)
    client?.switchTerminalAccount(term.project, term.id, account)
    reloadTerminalsSoon(term.project)
    session.scope.launch {
        delay(ACCOUNT_MOVE_WAIT_MS)
        setAccountMove(term.id, null)
    }
    return true
}

/** The tab that took [term]'s place moving to another account, once the project's list shows it. */
fun TerminalsState.movedTab(term: TerminalInfo): TerminalInfo? =
    terminals[term.project]?.firstOrNull { it.switchedFrom == term.id }

/** The account a tab is moving to while it moves: as the Mac lists it, or as this phone just asked. */
fun TerminalsState.accountMove(term: TerminalInfo): String? =
    term.switchingTo ?: accountMoves[term.id]

/** The stop a terminal's bar shows: as the Mac lists it, unless put away here. */
fun TerminalsState.limitStop(term: TerminalInfo): LimitStop? =
    term.limitStop?.takeIf { it != dismissedLimitStops[term.id] }

/** Put the bar away here at once; the Mac drops the stop and lists the tab again. */
fun TerminalsStore.dismissLimitStop(term: TerminalInfo) {
    val stop = term.limitStop ?: return
    setLimitStopDismissed(term.id, stop)
    client?.dismissLimitStop(term.project, term.id)
}

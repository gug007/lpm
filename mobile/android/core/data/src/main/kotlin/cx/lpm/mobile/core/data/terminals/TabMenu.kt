package cx.lpm.mobile.core.data.terminals

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.closeOtherTerminals
import cx.lpm.mobile.core.data.client.closeTerminal
import cx.lpm.mobile.core.data.client.forkTerminal
import cx.lpm.mobile.core.data.client.forkTerminalCopy
import cx.lpm.mobile.core.data.client.keepTerminal
import cx.lpm.mobile.core.data.client.moveTerminal
import cx.lpm.mobile.core.data.client.titleTerminal
import cx.lpm.mobile.core.model.TerminalInfo
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/*
 * The tab menu: closing with undo, or once its agent is done, forking a tab's
 * conversation here or into a copy of the project, giving a tab back its conversation
 * title, and closing every other tab — what the desktop's tab menu offers.
 */

const val UNDO_CLOSE_MS = 5_000L

/** The Mac takes fork / title / close-others (`tabMenu`). */
val TerminalsStore.canUseTabMenu: Boolean
    get() = client?.hostFeatures?.contains(LpmClient.TAB_MENU_FEATURE) == true

/**
 * Close a tab. It leaves the list at once but reaches the Mac only once the undo
 * window passes, so Undo has nothing to put back there.
 */
fun TerminalsStore.closeTerminal(project: String, id: String) {
    finishPendingTabClose()
    val list = state.value.terminals[project].orEmpty()
    val index = list.indexOfFirst { it.id == id }
    hideClosingTerminal(project, id)
    if (index < 0) {
        sendClose(project, id)
        return
    }
    setPendingTabClose(PendingTabClose(list[index], index))
    pendingTabCloseJob = session.scope.launch {
        delay(UNDO_CLOSE_MS)
        pendingTabCloseJob = null
        finishPendingTabClose()
    }
}

fun TerminalsStore.undoTabClose() {
    val pending = takePendingTabClose() ?: return
    unhideClosingTerminal(pending.tab, pending.index)
    loadTerminals(pending.tab.project)
}

/** Send a close still waiting on its undo now. */
fun TerminalsStore.finishPendingTabClose() {
    val pending = takePendingTabClose() ?: return
    sendClose(pending.tab.project, pending.tab.id)
}

/** The Mac lets a tab's agent finish before it closes it (`closeWhenDone`). */
val TerminalsStore.canCloseWhenDone: Boolean
    get() = client?.hostFeatures?.contains(LpmClient.CLOSE_WHEN_DONE_FEATURE) == true

/** Have the Mac close the tab once its agent is done. It stays listed until then. */
fun TerminalsStore.closeTerminalWhenDone(term: TerminalInfo) {
    if (!canCloseWhenDone) return
    client?.closeTerminal(term.project, term.id, whenDone = true)
    reloadTerminalsSoon(term.project)
}

fun TerminalsStore.keepTerminalOpen(term: TerminalInfo) {
    if (!canCloseWhenDone) return
    client?.keepTerminal(term.project, term.id)
    reloadTerminalsSoon(term.project)
}

/** Continue the tab's conversation in a new tab beside it, then hand that tab on. */
fun TerminalsStore.forkTerminal(term: TerminalInfo, onSpawn: ((TerminalInfo) -> Unit)? = null) {
    if (!canUseTabMenu || !term.canFork) return
    spawnTerminal(term.project, "Fork Session", onSpawn) { it.forkTerminal(term.project, term.id) }
}

/**
 * Continue the tab's conversation in a fresh copy of the project, which joins the
 * projects list once the Mac has made it.
 */
fun TerminalsStore.forkTerminalIntoCopy(term: TerminalInfo) {
    if (!canUseTabMenu || !term.canForkCopy) return
    client?.forkTerminalCopy(term.project, term.id)
}

/** Have the tab follow its conversation's title again instead of a name it was given. */
fun TerminalsStore.useConversationTitle(term: TerminalInfo) {
    if (!canUseTabMenu || !term.canTitle) return
    client?.titleTerminal(term.project, term.id)
    reloadTerminalsSoon(term.project)
}

/** The Mac moves a tab to another of its projects (`moveTab`). */
val TerminalsStore.canMoveTabs: Boolean
    get() = client?.hostFeatures?.contains(LpmClient.MOVE_TAB_FEATURE) == true

/**
 * Hand the tab to another project. It keeps running where it is; the Mac lists it
 * there, with its agent, from now on.
 */
fun TerminalsStore.moveTerminal(term: TerminalInfo, to: String) {
    if (!canMoveTabs) return
    client?.moveTerminal(term.project, term.id, to)
    reloadTerminalsSoon(term.project)
    reloadTerminalsSoon(to)
}

/** The unpinned tabs Close Other Tabs would close. */
fun TerminalsStore.otherClosableTerminals(term: TerminalInfo): List<TerminalInfo> =
    state.value.terminals[term.project].orEmpty().filter { it.id != term.id && !it.pinned }

/**
 * Close every other unpinned tab of the project, for good, as the desktop's Close Other
 * Tabs does: at once, or with [busy] given, those tabs (by id) once their agent is done.
 */
fun TerminalsStore.closeOtherTerminals(term: TerminalInfo, busy: Set<String>? = null) {
    if (!canUseTabMenu || (busy != null && !canCloseWhenDone)) return
    finishPendingTabClose()
    val others = otherClosableTerminals(term)
    if (others.isEmpty()) return
    for (other in others) {
        if (busy != null && other.id in busy) continue
        hideClosingTerminal(term.project, other.id)
        awaitClosedTerminal(term.project, other.id)
    }
    client?.closeOtherTerminals(term.project, term.id, whenDone = busy != null)
    if (busy != null) reloadTerminalsSoon(term.project)
}

private fun TerminalsStore.takePendingTabClose(): PendingTabClose? {
    pendingTabCloseJob?.cancel()
    pendingTabCloseJob = null
    val pending = state.value.pendingTabClose
    setPendingTabClose(null)
    return pending
}

private fun TerminalsStore.sendClose(project: String, id: String) {
    client?.closeTerminal(project, id)
    awaitClosedTerminal(project, id)
}

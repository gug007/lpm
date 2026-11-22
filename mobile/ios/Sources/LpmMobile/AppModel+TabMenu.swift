import Foundation

/// A tab closed on this phone that can still be brought back, and where it sat.
struct PendingTabClose: Equatable {
    let tab: TerminalInfo
    let index: Int
}

/// The tab menu: closing with undo, forking a tab's conversation here or into a
/// copy of the project, giving a tab back its conversation title, and closing
/// every other tab — what the desktop's tab menu offers.
extension AppModel {
    static let undoCloseSeconds: TimeInterval = 5

    /// The Mac takes fork / title / close-others (`tabMenu`).
    var canUseTabMenu: Bool {
        client?.hostFeatures.contains(LpmClient.tabMenuFeature) == true
    }

    /// Close a tab. It leaves the list at once but reaches the Mac only once the
    /// undo window passes, so Undo has nothing to put back there.
    func closeTerminal(_ project: String, id: String) {
        finishPendingTabClose()
        guard let index = terminals[project]?.firstIndex(where: { $0.id == id }),
              let tab = terminals[project]?[index] else {
            hideClosingTerminal(project, id: id)
            sendClose(project, id: id)
            return
        }
        hideClosingTerminal(project, id: id)
        pendingTabClose = PendingTabClose(tab: tab, index: index)
        let work = DispatchWorkItem { [weak self] in self?.finishPendingTabClose() }
        pendingTabCloseWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.undoCloseSeconds, execute: work)
    }

    func undoTabClose() {
        guard let pending = takePendingTabClose() else { return }
        unhideClosingTerminal(pending.tab, at: pending.index)
        loadTerminals(pending.tab.project)
    }

    /// Send a close still waiting on its undo now.
    func finishPendingTabClose() {
        guard let pending = takePendingTabClose() else { return }
        sendClose(pending.tab.project, id: pending.tab.id)
    }

    /// Continue the tab's conversation in a new tab beside it, then open that tab.
    func forkTerminal(_ term: TerminalInfo, onSpawn: ((TerminalInfo) -> Void)? = nil) {
        guard canUseTabMenu, term.canFork else { return }
        spawnTerminal(term.project, verb: "Fork Session", onSpawn: onSpawn) {
            $0.forkTerminal(project: term.project, id: term.id)
        }
    }

    /// Continue the tab's conversation in a fresh copy of the project, which joins
    /// the projects list once the Mac has made it.
    func forkTerminalIntoCopy(_ term: TerminalInfo) {
        guard canUseTabMenu, term.canForkCopy else { return }
        client?.forkTerminalCopy(project: term.project, id: term.id)
    }

    /// Have the tab follow its conversation's title again instead of a name it
    /// was given.
    func useConversationTitle(_ term: TerminalInfo) {
        guard canUseTabMenu, term.canTitle else { return }
        client?.titleTerminal(project: term.project, id: term.id)
        reloadTerminalsSoon(term.project)
    }

    /// The Mac moves a tab to another of its projects (`moveTab`).
    var canMoveTabs: Bool {
        client?.hostFeatures.contains(LpmClient.moveTabFeature) == true
    }

    /// The projects a tab can move to: the Mac's others, on the Mac itself, as
    /// the desktop's Move To lists them.
    func moveDestinations(_ term: TerminalInfo) -> [Project] {
        guard let from = projects.first(where: { $0.name == term.project }), !from.isRemote else { return [] }
        return projects
            .filter { $0.name != term.project && !$0.isRemote }
            .sorted { $0.label.localizedCompare($1.label) == .orderedAscending }
    }

    /// Hand the tab to another project. It keeps running where it is; the Mac
    /// lists it there, with its agent, from now on.
    func moveTerminal(_ term: TerminalInfo, to project: Project) {
        guard canMoveTabs else { return }
        client?.moveTerminal(project: term.project, id: term.id, to: project.name)
        reloadTerminalsSoon(term.project)
        reloadTerminalsSoon(project.name)
    }

    /// The unpinned tabs Close Other Tabs would close.
    func otherClosableTerminals(_ term: TerminalInfo) -> [TerminalInfo] {
        (terminals[term.project] ?? []).filter { $0.id != term.id && !$0.pinned }
    }

    /// Close every other unpinned tab of the project, at once and for good, as the
    /// desktop's Close Other Tabs does.
    func closeOtherTerminals(keeping term: TerminalInfo) {
        guard canUseTabMenu else { return }
        finishPendingTabClose()
        let others = otherClosableTerminals(term)
        guard !others.isEmpty else { return }
        for other in others {
            hideClosingTerminal(term.project, id: other.id)
            awaitClosedTerminal(term.project, id: other.id)
        }
        client?.closeOtherTerminals(project: term.project, id: term.id)
    }

    private func takePendingTabClose() -> PendingTabClose? {
        pendingTabCloseWork?.cancel()
        pendingTabCloseWork = nil
        defer { pendingTabClose = nil }
        return pendingTabClose
    }

    private func sendClose(_ project: String, id: String) {
        client?.closeTerminal(project: project, id: id)
        awaitClosedTerminal(project, id: id)
    }
}

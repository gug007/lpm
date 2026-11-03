import Foundation

/// The tab menu's Claude Account: continuing a Claude tab's conversation on
/// another of the Mac's accounts, as the desktop's tab menu does.
extension AppModel {
    /// How long a move this phone asked for covers the tab before the Mac
    /// lists it.
    private static let accountMoveWait: TimeInterval = 10

    /// The Mac moves tabs between Claude accounts (`tabAccount`).
    var canSwitchTabAccounts: Bool {
        client?.hostFeatures.contains(LpmClient.tabAccountFeature) == true
    }

    /// Continue the tab's conversation on `account`. The tab is covered at once,
    /// and for as long as the Mac lists it moving.
    func switchTerminalAccount(_ term: TerminalInfo, to account: ClaudeAccountInfo) {
        switchTerminalAccount(term, to: account.id, label: account.label)
    }

    func switchTerminalAccount(_ term: TerminalInfo, to account: String, label: String) {
        guard canSwitchTabAccounts, term.canSwitchAccount, account != term.claudeAccount else { return }
        Haptics.tap()
        accountMoves[term.id] = label
        client?.switchTerminalAccount(project: term.project, id: term.id, account: account)
        reloadTerminalsSoon(term.project)
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.accountMoveWait) { [weak self] in
            self?.accountMoves[term.id] = nil
        }
    }

    /// The tab that took `term`'s place moving to another account, once the
    /// project's list shows it.
    func movedTab(for term: TerminalInfo) -> TerminalInfo? {
        terminals[term.project]?.first { $0.switchedFrom == term.id }
    }

    /// The account a tab is moving to while it moves: as the Mac lists it, or as
    /// this phone just asked.
    func accountMove(for term: TerminalInfo) -> String? {
        term.switchingTo ?? accountMoves[term.id]
    }
}

/// A Claude tab stopped at a usage limit: its bar, and the move it offers.
extension AppModel {
    /// The stop a terminal's bar shows: as the Mac lists it, unless put away here.
    func limitStop(for term: TerminalInfo) -> LimitStop? {
        guard let stop = term.limitStop, dismissedLimitStops[term.id] != stop else { return nil }
        return stop
    }

    /// Put the bar away here at once; the Mac drops the stop and lists the tab again.
    func dismissLimitStop(_ term: TerminalInfo) {
        Haptics.tap()
        dismissedLimitStops[term.id] = term.limitStop
        client?.dismissLimitStop(project: term.project, id: term.id)
    }
}

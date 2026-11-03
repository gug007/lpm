import SwiftUI

/// "Claude Account" in a Claude tab's menu, as on the desktop: the account the
/// tab's conversation runs as, and the Mac's other accounts to continue it on,
/// each with its usage. A turn in progress is interrupted and carried on there.
struct TabClaudeAccountMenu: View {
    @Environment(AppModel.self) private var model
    let term: TerminalInfo
    let working: Bool

    var body: some View {
        if model.canSwitchTabAccounts, term.canSwitchAccount,
           let accounts = model.claudeAccounts, accounts.hasAdded {
            Menu {
                TabClaudeAccountChoices(term: term, working: working, accounts: accounts)
            } label: {
                Label {
                    Text("Claude Account")
                    if let account = term.claudeAccount { Text(accounts.label(account)) }
                } icon: {
                    Image(systemName: "person.crop.circle")
                }
            }
        }
    }
}

/// The Mac's accounts a Claude tab can continue its conversation on, the one it
/// runs as checked: the tab menu's Claude Account, and a limit bar's Other account.
struct TabClaudeAccountChoices: View {
    @Environment(AppModel.self) private var model
    let term: TerminalInfo
    let working: Bool
    let accounts: ClaudeAccounts

    var body: some View {
        Section(working ? "Interrupt this turn and continue it on" : "Continue this conversation on") {
            ForEach(accounts.accounts) { a in
                let current = a.id == term.claudeAccount
                Button { model.switchTerminalAccount(term, to: a) } label: {
                    ClaudeChoiceLabel(title: a.label,
                                      subtitle: a.signedIn ? usage(a.id) : "Not signed in",
                                      on: current)
                }
                .disabled(!a.signedIn && !current)
            }
        }
    }

    private func usage(_ account: String) -> String? {
        claudeUsageLine(model.usage.snapshot, account: account, now: Date().timeIntervalSince1970 * 1000)
    }
}

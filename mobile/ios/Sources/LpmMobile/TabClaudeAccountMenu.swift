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

    private func usage(_ account: String) -> String? {
        claudeUsageLine(model.usage.snapshot, account: account, now: Date().timeIntervalSince1970 * 1000)
    }
}

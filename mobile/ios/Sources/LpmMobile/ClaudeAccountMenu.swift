import SwiftUI

/// The project menu's "Claude Account" submenu, as on the desktop: which login
/// new Claude sessions in this project use — its parent's choice (for a copy),
/// the main accounts from the Mac's Settings, one account always, or its own
/// list to take turns on — with each account's usage beside it. Signing in,
/// adding accounts and turning switching on stay on the Mac.
struct ClaudeAccountMenu: View {
    @Environment(AppModel.self) private var model
    let project: Project
    // The accounts waiting on "only mine" before joining the list; the host asks.
    @Binding var consentFor: ClaudeConsentRequest?

    private static let ordinals = ["1st", "2nd", "3rd", "4th", "5th"]

    private var own: ClaudeOwnChoice { project.claude }
    private var isCopy: Bool { project.isDuplicate }

    var body: some View {
        if let accounts = model.claudeAccounts, accounts.hasAdded {
            Menu {
                choices(accounts)
            } label: {
                Label {
                    Text("Claude Account")
                    Text(summary(accounts))
                } icon: {
                    Image(systemName: "person.crop.circle")
                }
            }
        }
    }

    @ViewBuilder
    private func choices(_ accounts: ClaudeAccounts) -> some View {
        if isCopy {
            Button { pick(.parent) } label: {
                row("Same as parent",
                    accounts.describe(model.parentProject(of: project)?.claude ?? ClaudeOwnChoice()),
                    on: own.followsParent)
            }
        }
        Button { pick(.main) } label: {
            row("Main accounts", accounts.mainNow, on: own.usesMainAccounts(isCopy: isCopy))
        }
        Section("Always use one account") {
            ForEach(accounts.accounts) { a in
                let id = a.id == claudeMainLogin ? "" : a.id
                Button { pick(.pin(id)) } label: {
                    row(a.label, a.signedIn ? usage(a.id) : "Not signed in", on: own.account == id)
                }
            }
        }
        Section {
            Menu {
                listChoices(accounts)
            } label: {
                row("Choose Accounts",
                    own.list.isEmpty
                        ? "Take turns on up to \(accounts.switching.maxMembers), in order"
                        : own.list.map(accounts.label).joined(separator: ", "),
                    on: !own.list.isEmpty)
            }
        }
    }

    /// Each tap adds an account to the end of the project's list or takes it
    /// out, and is saved at once, so the list reads in the order it was built.
    /// Accounts in the list come first, in their turn.
    @ViewBuilder
    private func listChoices(_ accounts: ClaudeAccounts) -> some View {
        let list = own.list
        let members = list.compactMap(accounts.account)
        let rest = accounts.accounts.filter { !list.contains($0.id) }
        let full = list.count >= accounts.switching.maxMembers
        let current = accounts.switching.current[project.name]
        Section(accounts.switching.enabled
                ? "Take turns, in this order"
                : "Switching is off: new sessions use the first") {
            ForEach(Array(members.enumerated()), id: \.element.id) { i, a in
                let parts: [String?] = [Self.ordinals[min(i, Self.ordinals.count - 1)],
                             a.id == current ? "New sessions" : nil,
                             usage(a.id)]
                Button { setList(list.filter { $0 != a.id }, accounts) } label: {
                    row(a.label, parts.compactMap { $0 }.joined(separator: " · "), on: true)
                }
                .disabled(list.count == 1)
            }
            ForEach(rest) { a in
                let blocked = accounts.blocked(a) ?? (full ? "Up to \(accounts.switching.maxMembers) take turns" : nil)
                Button { setList(list + [a.id], accounts) } label: {
                    row(a.label, blocked ?? usage(a.id), on: false)
                }
                .disabled(blocked != nil)
            }
        }
    }

    private func row(_ title: String, _ subtitle: String?, on: Bool) -> some View {
        ClaudeChoiceLabel(title: title, subtitle: subtitle, on: on)
    }

    private func usage(_ account: String) -> String? {
        claudeUsageLine(model.usage.snapshot, account: account, now: Date().timeIntervalSince1970 * 1000)
    }

    private func summary(_ accounts: ClaudeAccounts) -> String {
        if isCopy && own.followsParent { return "Same as parent" }
        if own.usesMainAccounts(isCopy: isCopy) { return "Main accounts · \(accounts.mainNow)" }
        return accounts.describe(own)
    }

    private func pick(_ choice: ClaudeAccountChoice) {
        guard choice.own(isCopy: isCopy) != own else { return }
        model.setClaudeAccount(project, choice)
    }

    /// Accounts that would take turns are confirmed as the person's own first,
    /// as on the desktop.
    private func setList(_ ids: [String], _ accounts: ClaudeAccounts) {
        let unconfirmed = ids.compactMap(accounts.account).filter { $0.signedIn && !$0.confirmed }
        if unconfirmed.isEmpty {
            pick(.list(ids))
        } else {
            consentFor = ClaudeConsentRequest(project: project, ids: ids, accounts: unconfirmed)
        }
    }
}

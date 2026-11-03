import SwiftUI

/// The checks sheet's "Fix with …" rows, as the desktop's checks menu lists them:
/// every agent the project's New Tab sheet offers. A header split button or menu is
/// one row: a split's row runs the item its button leads with and its chevron lists
/// every item; a menu's whole row lists them.
struct CiFixRows: View {
    let tabs: [LaunchpadTab]
    let onFix: (LaunchpadOption) -> Void

    private var only: Bool { tabs.count == 1 && tabs[0].options.count == 1 }

    var body: some View {
        ForEach(tabs) { tab in
            if tab.options.count > 1 {
                group(tab)
            } else if let option = tab.options.first {
                Button { onFix(option) } label: {
                    CiFixLabel(text: "Fix with \(option.label)", agent: option.agent, described: only)
                }
            }
        }
    }

    @ViewBuilder private func group(_ tab: LaunchpadTab) -> some View {
        if let lead = tab.primary {
            HStack(spacing: 4) {
                Button { onFix(lead) } label: {
                    CiFixLabel(text: "Fix with \(lead.label)", agent: lead.agent, described: false)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.borderless)
                items(tab) { chevron.frame(width: 32, height: 44).contentShape(Rectangle()) }
                    .accessibilityLabel("Pick from \(tab.label)")
            }
        } else {
            items(tab) {
                HStack(spacing: 4) {
                    CiFixLabel(text: "Fix with \(tab.label)", agent: tab.options[0].agent, described: false)
                    Spacer()
                    chevron.frame(width: 32)
                }
                .contentShape(Rectangle())
            }
        }
    }

    private var chevron: some View {
        Image(systemName: "chevron.up.chevron.down")
            .font(.footnote.weight(.semibold))
            .foregroundStyle(.secondary)
    }

    private func items(_ tab: LaunchpadTab, @ViewBuilder label: () -> some View) -> some View {
        Menu {
            ForEach(tab.options) { option in
                Button(option.label) { onFix(option) }
            }
        } label: {
            label()
        }
    }
}

/// A fix row's face: the agent's mark beside what it does.
private struct CiFixLabel: View {
    let text: String
    let agent: String
    /// Says what the row opens, for a sheet with only one way to fix.
    let described: Bool

    var body: some View {
        Label {
            VStack(alignment: .leading, spacing: 2) {
                Text(text)
                if described {
                    Text("Opens a new tab with the failing checks")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
        } icon: {
            if let mark = AgentMark(agent) {
                mark
            } else {
                Image(systemName: "sparkle").foregroundStyle(providerMeta(agent).color)
            }
        }
    }
}

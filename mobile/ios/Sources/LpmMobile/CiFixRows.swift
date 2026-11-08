import SwiftUI

/// The checks sheet's "Fix with …" rows, as the desktop's checks menu lists them:
/// every agent the project's New Tab sheet offers. A header split button or menu is
/// one row: a split's row runs the item its button leads with and its chevron lists
/// every item; a menu's whole row lists them. In a `panel` (outside a List) each row
/// sizes and divides itself as a List row would.
struct CiFixRows: View {
    let tabs: [LaunchpadTab]
    /// What a row opens, said under it when it's the only way to fix.
    var detail = "Opens a new tab with the failing checks"
    var panel = false
    let onFix: (LaunchpadOption) -> Void

    private var only: Bool { tabs.count == 1 && tabs[0].options.count == 1 }

    var body: some View {
        ForEach(Array(tabs.enumerated()), id: \.element.id) { index, tab in
            row(tab).overlay(alignment: .top) {
                if panel && index > 0 { PanelRowDivider() }
            }
        }
    }

    @ViewBuilder private func row(_ tab: LaunchpadTab) -> some View {
        if tab.options.count > 1 {
            group(tab)
        } else if let option = tab.options.first {
            Button { onFix(option) } label: {
                CiFixLabel(text: "Fix with \(option.label)", agent: option.agent, emoji: option.emoji,
                           detail: only ? detail : nil)
                    .panelRowFrame(panel)
            }
        }
    }

    @ViewBuilder private func group(_ tab: LaunchpadTab) -> some View {
        if let lead = tab.primary {
            HStack(spacing: 4) {
                Button { onFix(lead) } label: {
                    CiFixLabel(text: "Fix with \(lead.label)", agent: lead.agent, emoji: lead.emoji, detail: nil)
                        .panelRowFrame(panel, trailing: 0)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.borderless)
                items(tab) { chevron.frame(width: 32, height: panel ? PanelRow.height : 44).contentShape(Rectangle()) }
                    .accessibilityLabel("Pick from \(tab.label)")
            }
            .padding(.trailing, panel ? 8 : 0)
        } else {
            items(tab) {
                HStack(spacing: 4) {
                    CiFixLabel(text: "Fix with \(tab.label)", agent: tab.options[0].agent, emoji: tab.emoji, detail: nil)
                    Spacer()
                    chevron.frame(width: 32)
                }
                .panelRowFrame(panel, trailing: 8)
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
                Button(option.menuTitle) { onFix(option) }
            }
        } label: {
            label()
        }
    }
}

/// A fix row's face: its mark beside what it does.
private struct CiFixLabel: View {
    let text: String
    let agent: String
    let emoji: String
    /// What the row opens, for a sheet with only one way to fix.
    let detail: String?

    var body: some View {
        Label {
            VStack(alignment: .leading, spacing: 2) {
                Text(text)
                if let detail {
                    Text(detail)
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
        } icon: {
            LaunchpadMark(agent: agent, emoji: emoji)
        }
    }
}

import SwiftUI

/// A header split button or menu in the New Tab sheet's Start list, picked as the
/// desktop's empty project picks it: the row picks the item the split leads with
/// (the picked one, when it holds it) and the chevron lists every item; a menu with
/// nothing to lead with opens its items from the whole row.
struct NewTabGroupRow: View {
    let tab: LaunchpadTab
    /// The picked option's id.
    let picked: String
    let onPick: (LaunchpadOption) -> Void

    private var current: LaunchpadOption? { tab.options.first { $0.id == picked } }

    var body: some View {
        if let primary = tab.primary {
            let lead = current ?? primary
            HStack(spacing: 4) {
                Button { onPick(lead) } label: {
                    NewTabStartLabel(label: lead.label, agent: lead.agent, emoji: lead.emoji, picked: current != nil)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(current != nil ? .isSelected : [])
                items { chevron.frame(width: 32, height: 44).contentShape(Rectangle()) }
                    .accessibilityLabel("Pick from \(tab.label)")
            }
        } else {
            items {
                HStack(spacing: 4) {
                    NewTabStartLabel(label: current?.label ?? tab.label,
                                     agent: (current ?? tab.options[0]).agent,
                                     emoji: current?.emoji ?? tab.emoji, picked: current != nil)
                    chevron.frame(width: 32)
                }
            }
            .accessibilityAddTraits(current != nil ? .isSelected : [])
        }
    }

    private var chevron: some View {
        Image(systemName: "chevron.up.chevron.down")
            .font(.footnote.weight(.semibold))
            .foregroundStyle(.secondary)
    }

    private func items(@ViewBuilder label: () -> some View) -> some View {
        Menu {
            Picker(tab.label, selection: Binding(
                get: { picked },
                set: { id in tab.options.first { $0.id == id }.map(onPick) }
            )) {
                ForEach(tab.options) { Text($0.menuTitle).tag($0.id) }
            }
        } label: {
            label()
        }
        .tint(.secondary)
    }
}

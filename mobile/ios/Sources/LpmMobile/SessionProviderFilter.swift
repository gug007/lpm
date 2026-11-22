import SwiftUI

/// Resume Session's agent filter: All, then one choice per agent. Claude and
/// Codex fit the segmented control the list has always had; once Gemini,
/// OpenCode or Cursor have sessions too, the choices become a row of chips
/// that scrolls, so no name gets cut short.
struct SessionProviderFilter: View {
    let providers: [String]
    /// A provider key, or `nil` for All.
    @Binding var selection: String?

    var body: some View {
        if providers.count <= 2 {
            Picker("Agent", selection: $selection) {
                Text("All").tag(String?.none)
                ForEach(providers, id: \.self) { Text(providerMeta($0).short).tag(String?.some($0)) }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 20)
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    chip("All", value: nil)
                    ForEach(providers, id: \.self) { chip(providerMeta($0).short, value: $0) }
                }
                .padding(.horizontal, 20)
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Agent")
        }
    }

    private func chip(_ label: String, value: String?) -> some View {
        let on = selection == value
        return Button {
            Haptics.tap()
            selection = value
        } label: {
            Text(label)
                .font(.subheadline.weight(on ? .semibold : .medium))
                .foregroundStyle(.primary)
                .padding(.horizontal, 14)
                .frame(height: 32)
                .background(
                    Capsule().fill(on ? Color(.secondarySystemGroupedBackground) : Color(.tertiarySystemFill))
                        .shadow(color: .black.opacity(on ? 0.12 : 0), radius: 1.5, y: 1)
                )
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// The agents the filter offers: Claude and Codex always, as the list always
/// has, then each other agent with sessions in `rows`, in the desktop's order,
/// and the selected one even when a search has left it nothing.
func sessionFilterProviders(_ rows: [String], selected: String?) -> [String] {
    let present = Set(rows).union(selected.map { [$0] } ?? [])
    let order = ["claude", "codex", "gemini", "opencode", "cursor"]
    let known = order.filter { $0 == "claude" || $0 == "codex" || present.contains($0) }
    let other = present.subtracting(order).sorted()
    return known + other
}

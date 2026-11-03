import SwiftUI

/// The Automations list's Failed filter: "Failed" and how many rows it would
/// keep, tinted red while it's on, like the desktop's header button.
struct AutomationFailedToggle: View {
    let count: Int
    let isOn: Bool
    let toggle: () -> Void

    var body: some View {
        Button {
            Haptics.tap()
            withAnimation { toggle() }
        } label: {
            HStack(spacing: 4) {
                Text("Failed")
                    .foregroundStyle(.primary)
                Text("\(count)")
                    .monospacedDigit()
                    .foregroundStyle(.red)
            }
            .font(.subheadline.weight(.medium))
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(isOn ? Color.red.opacity(0.16) : .clear, in: Capsule())
        }
        .accessibilityLabel("Failed, \(count)")
        .accessibilityHint(isOn ? "Shows every automation" : "Shows only the automations whose last run failed")
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}

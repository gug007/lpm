import SwiftUI

/// In place of the composer under a conversation whose terminal is driven
/// elsewhere: reading it needs no control, sending does.
struct ControlHandoffBar: View {
    let ownerLabel: String
    let background: Color
    let onTakeControl: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Text("Active on \(ownerLabel)")
                .font(.footnote)
                .foregroundStyle(.white.opacity(0.7))
                .lineLimit(2)
            Spacer(minLength: 8)
            Button("Take control") {
                Haptics.tap()
                onTakeControl()
            }
            .font(.subheadline)
            .buttonStyle(.bordered)
            .buttonBorderShape(.capsule)
            .tint(.white)
        }
        .terminalBottomBar(background)
    }
}

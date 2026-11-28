import SwiftUI

/// One step of a Talk plan: its tile, what it does over the thing it does it to,
/// and the control that changes it. A line runs down to the next step's tile.
struct TalkPlanRow<Value: View, Change: View>: View {
    let icon: String
    var tint: Color = .secondary
    let title: String
    var connects = true
    @ViewBuilder let value: Value
    @ViewBuilder let change: Change

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(spacing: 0) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(tint)
                    .frame(width: 36, height: 36)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
                    .overlay { RoundedRectangle(cornerRadius: 10).strokeBorder(Color(.separator).opacity(0.6)) }
                if connects {
                    Rectangle()
                        .fill(Color(.separator).opacity(0.6))
                        .frame(width: 1)
                        .frame(minHeight: 14, maxHeight: .infinity)
                }
            }
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                value
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, connects ? 16 : 0)
            change
                .font(.subheadline)
                .padding(.top, -4)
        }
    }
}

/// The words of a row's control, with room for a thumb around them.
struct TalkPlanRowLabel: View {
    let title: String

    var body: some View {
        Text(title)
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
    }
}

import SwiftUI

/// A popup's or an app's title, and beside it how old its data is, kept current.
struct ActionPageHeading: View {
    let title: String
    let updatedAt: Int64?

    var body: some View {
        HStack(spacing: 6) {
            Text(title)
                .font(.headline)
                .lineLimit(1)
            if let updatedAt, updatedAt > 0 {
                TimelineView(.periodic(from: .now, by: 5)) { context in
                    Text(relativeAgo(Int(updatedAt / 1000), now: context.date))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .fixedSize()
                }
            }
        }
    }
}

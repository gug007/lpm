import SwiftUI

/// A Claude account signed in as the same Claude account as an earlier one,
/// which happens when `/login` inside it picks that account: its usage is that
/// account's, shown on the earlier card. The desktop's `UsageSameLoginCard`;
/// signing it in again happens on the Mac.
struct UsageSameLoginCardView: View {
    let title: String
    let email: String?
    let sameAsTitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Circle()
                    .fill(providerMeta("claude").color)
                    .frame(width: 8, height: 8)
                    .opacity(0.5)
                Text(title)
                    .font(.subheadline.weight(.semibold))
                if let email {
                    Text(email)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            Divider().padding(.vertical, 12)
            Text("Signed in as the same Claude account as \(sameAsTitle), so its usage shows on that card.")
                .font(.footnote)
                .foregroundStyle(.orange)
                .fixedSize(horizontal: false, vertical: true)
            Text("Sign it in again in lpm on your Mac.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.top, 6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color(.secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

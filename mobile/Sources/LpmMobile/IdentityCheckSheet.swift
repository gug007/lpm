import SwiftUI

/// Shown when the active Mac presents a different security identity than the one
/// this iPhone paired with. Instead of trusting it on a warning, the user
/// compares a short code with the one lpm shows on the Mac.
struct IdentityCheckSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.shield")
                .font(.system(size: 40, weight: .semibold))
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(.orange)
                .padding(.top, 8)

            VStack(spacing: 8) {
                Text("Check that it's \(model.link.macLabel)")
                    .font(.title2.weight(.bold))
                    .multilineTextAlignment(.center)
                Text("It has a new security identity. That's normal after lpm is reinstalled. Compare this code with the one in lpm on the Mac, under Settings → Mobile devices.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let code = model.link.identityCode {
                Text(code)
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .kerning(1)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .padding(.vertical, 14)
                    .frame(maxWidth: .infinity)
                    .background(Color(uiColor: .tertiarySystemGroupedBackground),
                                in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .accessibilityLabel("Code \(code.replacingOccurrences(of: " · ", with: " "))")
            }

            VStack(spacing: 8) {
                if model.link.identityCode != nil {
                    Button {
                        Haptics.tap()
                        model.trustNewIdentity()
                        dismiss()
                    } label: {
                        Text("The codes match").font(.headline).frame(maxWidth: .infinity, minHeight: 46)
                    }
                    .buttonStyle(.borderedProminent)
                    .buttonBorderShape(.roundedRectangle(radius: 14))
                }

                Button {
                    model.link.afterSheetCloses { model.repairActiveMac(reason: .identity) }
                    dismiss()
                } label: {
                    Text("Pair again instead").frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
                .buttonBorderShape(.roundedRectangle(radius: 14))

                if model.link.identityCode != nil {
                    Button(role: .destructive) {
                        Haptics.warning()
                        model.rejectNewIdentity()
                        dismiss()
                    } label: {
                        Text("They don't match").frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.bordered)
                    .buttonBorderShape(.roundedRectangle(radius: 14))
                }
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 16)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }
}

import SwiftUI

/// The waiting UI for approve-on-Mac pairing: the user tapped a nearby Mac, and
/// now confirms on the Mac itself. Shows the shared match code, waits for the
/// Allow tap, and reports a decline / timeout — always offering a fall back to
/// typing the pairing code instead.
struct ApprovalPairingSheet: View {
    @Environment(AppModel.self) private var model
    let macName: String
    let onCancel: () -> Void
    let onRetry: () -> Void
    let onEnterCode: () -> Void

    private var macLabel: String { macName.isEmpty ? "your Mac" : macName }

    var body: some View {
        VStack(spacing: 24) {
            switch model.approvalPairing {
            case .waiting(let code):
                waiting(code)
            case .denied(let reason):
                failure(
                    icon: reason == "busy" ? "hourglass" : "hand.raised.slash",
                    title: reason == "busy" ? "Mac is busy" : "Pairing declined",
                    message: reason == "busy"
                        ? "\(macLabel) is busy with another pairing request. Try again in a moment."
                        : "Pairing was declined on the Mac."
                )
            case .timedOut:
                failure(icon: "clock.badge.xmark", title: "No answer",
                        message: "No answer from \(macLabel). Make sure lpm is open on your Mac.")
            case .requesting, .none:
                requesting
            }
        }
        .frame(maxWidth: .infinity)
        .padding(28)
        .presentationDetents([.medium])
        .interactiveDismissDisabled()
    }

    private var requesting: some View {
        VStack(spacing: 18) {
            ProgressView().controlSize(.large)
            Text("Contacting \(macLabel)…")
                .font(.headline)
                .multilineTextAlignment(.center)
            enterCodeButton
        }
    }

    private func waiting(_ code: String) -> some View {
        VStack(spacing: 20) {
            Image(systemName: "checkmark.shield")
                .font(.system(size: 40, weight: .semibold))
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(.blue)

            VStack(spacing: 6) {
                Text("Confirm on your Mac")
                    .font(.title3.weight(.bold))
                Text("Approve this iPhone in the lpm window on \(macLabel), and check the code matches.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Text(grouped(code))
                .font(.system(size: 46, weight: .bold, design: .rounded))
                .monospacedDigit()
                .kerning(2)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity)
                .background(
                    Color(uiColor: .secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 18, style: .continuous)
                )

            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text("Waiting for approval…")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            VStack(spacing: 6) {
                Button(role: .cancel, action: onCancel) {
                    Text("Cancel").frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
                .buttonBorderShape(.roundedRectangle(radius: 12))
                enterCodeButton
            }
        }
    }

    private func failure(icon: String, title: String, message: String) -> some View {
        VStack(spacing: 18) {
            Image(systemName: icon)
                .font(.system(size: 38, weight: .semibold))
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(.orange)

            VStack(spacing: 6) {
                Text(title).font(.title3.weight(.bold))
                Text(message)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(spacing: 6) {
                Button(action: onRetry) {
                    Text("Try Again").frame(maxWidth: .infinity, minHeight: 46)
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.roundedRectangle(radius: 12))

                Button(action: onCancel) {
                    Text("Cancel").frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
                .buttonBorderShape(.roundedRectangle(radius: 12))

                enterCodeButton
            }
        }
    }

    private var enterCodeButton: some View {
        Button("Enter code instead", action: onEnterCode)
            .font(.subheadline)
            .padding(.top, 2)
    }

    /// Group a 4-digit match code as "12 34" for legibility; any other length is
    /// shown verbatim.
    private func grouped(_ code: String) -> String {
        guard code.count == 4 else { return code }
        let mid = code.index(code.startIndex, offsetBy: 2)
        return code[..<mid] + " " + code[mid...]
    }
}

import SwiftUI

/// What "Read it now" needs: whether it is running, why the last one failed,
/// and how to start it.
struct UsageReader {
    let busy: Bool
    let error: String?
    let read: () -> Void
}

/// In place of the meters when a reading is old (`oldMs`): how old, what it
/// said then, and a way to read the account again. The desktop card's
/// `UsageOldReading`.
struct UsageOldReadingView: View {
    let data: ProviderLimits
    /// The Mac's clock, which stamped `updatedAt`.
    let macNow: Double
    var reader: UsageReader? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(lastReadText(data.updatedAt, now: macNow))
                .font(.body.weight(.medium))
                .foregroundStyle(.secondary)
            if !thenText.isEmpty {
                Text(thenText)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            if let reader {
                Button(action: reader.read) {
                    HStack(spacing: 6) {
                        if reader.busy {
                            ProgressView().controlSize(.mini)
                        } else {
                            Image(systemName: "arrow.clockwise")
                        }
                        Text(reader.busy ? "Reading…" : "Read it now")
                    }
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.capsule)
                .controlSize(.small)
                .disabled(reader.busy)
                .padding(.top, 4)
                Text("Claude reports usage only when it replies; this asks it for one short reply.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                if let error = reader.error {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var thenText: String {
        var parts: [String] = []
        if let weekly = data.weekly { parts.append("Weekly was \(Int(weekly.usedPercent.rounded()))%") }
        if !data.noFiveHour, let five = data.fiveHour { parts.append("5-hour was \(Int(five.usedPercent.rounded()))%") }
        return parts.isEmpty ? "" : parts.joined(separator: " · ") + " then."
    }
}

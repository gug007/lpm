import SwiftUI

/// One tool's usage card: who it is, when it last reported, and its 5-hour and
/// weekly meters. A card whose numbers have gone stale keeps showing them, just
/// dimmed, so the reading is never silently replaced by nothing.
struct UsageProviderCardView: View {
    let data: ProviderLimits
    /// Unix millis on the phone's clock, for the windows the tools stamped.
    let now: Double
    /// The same moment on the Mac's clock, for the `updatedAt` the Mac stamped.
    let macNow: Double
    let title: String
    var subtitle: String? = nil

    private var stale: Bool { macNow - Double(data.updatedAt) > staleMs }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header

            Divider().padding(.vertical, 12)

            VStack(spacing: 18) {
                UsageMeterView(
                    label: "5-hour",
                    win: data.fiveHour,
                    windowMs: fiveHourMs,
                    now: now,
                    stale: stale
                )
                UsageMeterView(
                    label: "Weekly",
                    win: data.weekly,
                    windowMs: weeklyMs,
                    now: now,
                    stale: stale
                )
            }
        }
        .padding(16)
        .background(Color(.secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    /// One row while it fits; then the timestamp drops to its own line, then the
    /// plan capsule does too. Large text crowds the name out of a single row, and
    /// the card is worthless if its identity truncates to "C…".
    private var header: some View {
        VStack(alignment: .leading, spacing: 3) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) {
                    identity
                    Spacer(minLength: 8)
                    updated
                }
                VStack(alignment: .leading, spacing: 6) {
                    identity
                    updated
                }
                VStack(alignment: .leading, spacing: 6) {
                    name
                    if let label = data.label, !label.isEmpty {
                        planCapsule(label).padding(.leading, 16)
                    }
                    updated
                }
            }

            if let subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .padding(.leading, 16)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var identity: some View {
        HStack(spacing: 8) {
            name
            if let label = data.label, !label.isEmpty {
                planCapsule(label)
            }
        }
    }

    private var name: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(providerMeta(data.provider).color)
                .frame(width: 8, height: 8)
                .opacity(stale ? 0.5 : 1)

            Text(title)
                .font(.subheadline.weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func planCapsule(_ label: String) -> some View {
        Text(label.uppercased())
            .font(.caption2.weight(.medium))
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Color(.tertiarySystemFill), in: Capsule())
    }

    private var updated: some View {
        Text(updatedText(data.updatedAt, now: macNow))
            .font(.caption2)
            .foregroundStyle(.secondary)
            .monospacedDigit()
            .fixedSize(horizontal: false, vertical: true)
            .opacity(stale ? 0.6 : 1)
    }
}

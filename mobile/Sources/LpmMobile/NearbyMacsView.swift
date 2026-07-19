import SwiftUI

/// The list of Macs found on the local network, shown on the pairing screen above
/// the manual-entry fields. Tapping one fills in its address; the pairing code is
/// still entered by hand, so discovery never bypasses the pairing step. A Mac
/// that's already paired is shown but marked and not tappable, and the one whose
/// resolved address currently fills the address field shows a checkmark.
struct NearbyMacsView: View {
    let macs: [MacDiscovery.DiscoveredMac]
    let pairedServerIds: Set<String>
    let resolvingId: String?
    let selectedId: String?
    let onPick: (MacDiscovery.DiscoveredMac) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("NEARBY")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            VStack(spacing: 0) {
                ForEach(Array(macs.enumerated()), id: \.element.id) { index, mac in
                    let paired = mac.serverId.map(pairedServerIds.contains) ?? false
                    Button {
                        if !paired { onPick(mac) }
                    } label: {
                        NearbyMacRow(
                            mac: mac,
                            paired: paired,
                            resolving: resolvingId == mac.id,
                            selected: selectedId == mac.id
                        )
                    }
                    .buttonStyle(.plain)
                    .disabled(paired)

                    if index < macs.count - 1 {
                        Divider().padding(.leading, 72)
                    }
                }
            }
            .background(
                Color(uiColor: .secondarySystemGroupedBackground),
                in: RoundedRectangle(cornerRadius: 18, style: .continuous)
            )
        }
    }
}

private struct NearbyMacRow: View {
    let mac: MacDiscovery.DiscoveredMac
    let paired: Bool
    let resolving: Bool
    let selected: Bool

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "desktopcomputer")
                .font(.system(size: 23, weight: .medium))
                .foregroundStyle(.white)
                .frame(width: 42, height: 42)
                .background(.blue, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .opacity(paired ? 0.4 : 1)

            VStack(alignment: .leading, spacing: 3) {
                Text(mac.displayName.isEmpty ? "Mac" : mac.displayName)
                    .font(.headline)
                    .foregroundStyle(paired ? AnyShapeStyle(.secondary) : AnyShapeStyle(.primary))
                    .lineLimit(1)
                    .truncationMode(.tail)
                if mac.isDev {
                    Text("Development build")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 8)

            accessory
        }
        .padding(16)
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private var accessory: some View {
        if resolving {
            ProgressView().controlSize(.small)
        } else if paired {
            Text("Added").font(.subheadline).foregroundStyle(.secondary)
        } else if selected {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(.blue)
        } else {
            Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
    }
}

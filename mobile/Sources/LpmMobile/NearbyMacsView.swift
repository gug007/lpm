import SwiftUI

/// The list of Macs found on the local network, shown on the pairing screen above
/// the manual-entry fields. Tapping one fills in its address; the pairing code is
/// still entered by hand, so discovery never bypasses the pairing step. A Mac
/// that's already paired is shown but marked and not tappable.
struct NearbyMacsView: View {
    let macs: [MacDiscovery.DiscoveredMac]
    let pairedServerIds: Set<String>
    let resolvingId: String?
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
                        NearbyMacRow(mac: mac, paired: paired, resolving: resolvingId == mac.id)
                    }
                    .buttonStyle(.plain)
                    .disabled(paired)

                    if index < macs.count - 1 {
                        Divider().padding(.leading, 56)
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

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "desktopcomputer")
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(paired ? AnyShapeStyle(.secondary) : AnyShapeStyle(.blue))
                .frame(width: 26)

            VStack(alignment: .leading, spacing: 2) {
                Text(mac.name.isEmpty ? "Mac" : mac.name)
                    .font(.body)
                    .foregroundStyle(.primary)
                if mac.isDev {
                    Text("Development build")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            if resolving {
                ProgressView().controlSize(.small)
            } else if paired {
                Text("Added").font(.caption).foregroundStyle(.secondary)
            } else {
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
        }
        .frame(minHeight: 56)
        .padding(.horizontal, 16)
        .contentShape(Rectangle())
    }
}

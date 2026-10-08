import SwiftUI
import UIKit

/// Macs found on this Wi-Fi, first on the pairing screen: tap one, then approve
/// on the Mac. Says honestly when it's still looking, when nothing turned up, and
/// when Local Network access is off. A Mac already on this phone shows as added —
/// except the one being paired again, which stays tappable.
struct NearbyMacsView: View {
    let discovery: MacDiscovery
    let pairedServerIds: Set<String>
    /// The Mac being paired again, listed first.
    var preferredServerId: String? = nil
    let resolvingId: String?
    let onPick: (MacDiscovery.DiscoveredMac) -> Void

    private var macs: [MacDiscovery.DiscoveredMac] {
        guard let preferredServerId else { return discovery.found }
        return discovery.found.filter { $0.serverId == preferredServerId }
            + discovery.found.filter { $0.serverId != preferredServerId }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("On this Wi-Fi")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
                .padding(.leading, 4)

            VStack(spacing: 0) {
                if discovery.denied {
                    StateRow(icon: "lock.shield", title: "Allow Local Network access",
                             detail: "lpm needs it to find your Mac on this Wi-Fi.") {
                        Button("Settings") {
                            if let url = URL(string: UIApplication.openSettingsURLString) {
                                UIApplication.shared.open(url)
                            }
                        }
                        .buttonStyle(.bordered)
                        .buttonBorderShape(.capsule)
                        .controlSize(.small)
                    }
                } else if macs.isEmpty {
                    if discovery.searchedAWhile {
                        StateRow(icon: "magnifyingglass", title: "No Macs found",
                                 detail: "Make sure lpm is open and both are on the same Wi-Fi.") {
                            ProgressView().controlSize(.small)
                        }
                    } else {
                        StateRow(icon: nil, title: "Looking for Macs running lpm…", detail: nil) {
                            EmptyView()
                        }
                    }
                } else {
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
                            Divider().padding(.leading, 72)
                        }
                    }
                }
            }
            .background(Color(uiColor: .secondarySystemGroupedBackground),
                        in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }
}

private struct StateRow<Accessory: View>: View {
    let icon: String?
    let title: String
    let detail: String?
    @ViewBuilder let accessory: () -> Accessory

    var body: some View {
        HStack(spacing: 14) {
            Group {
                if let icon {
                    Image(systemName: icon).font(.system(size: 20, weight: .medium)).foregroundStyle(.secondary)
                } else {
                    ProgressView()
                }
            }
            .frame(width: 42, height: 42)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.headline)
                if let detail {
                    Text(detail).font(.subheadline).foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 8)
            accessory()
        }
        .padding(16)
    }
}

private struct NearbyMacRow: View {
    let mac: MacDiscovery.DiscoveredMac
    let paired: Bool
    let resolving: Bool

    private var subtitle: String {
        if mac.isDev { return "Development build" }
        if paired { return "Already on this iPhone" }
        return mac.requestPair ? "Tap, then approve on the Mac" : "Linux host · pairs with a code"
    }

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: mac.requestPair ? "desktopcomputer" : "server.rack")
                .font(.system(size: 22, weight: .medium))
                .foregroundStyle(.white)
                .frame(width: 42, height: 42)
                .background(mac.requestPair ? Color.blue : Color.gray,
                            in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .opacity(paired ? 0.4 : 1)

            VStack(alignment: .leading, spacing: 3) {
                Text(mac.displayName.isEmpty ? "Mac" : mac.displayName)
                    .font(.headline)
                    .foregroundStyle(paired ? AnyShapeStyle(.secondary) : AnyShapeStyle(.primary))
                    .lineLimit(1)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            if resolving {
                ProgressView().controlSize(.small)
            } else if paired {
                Text("Added").font(.subheadline).foregroundStyle(.secondary)
            } else {
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(16)
        .contentShape(Rectangle())
    }
}

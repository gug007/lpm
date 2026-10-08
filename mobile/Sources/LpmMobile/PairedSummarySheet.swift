import SwiftUI
import UserNotifications

/// The check right after pairing, while both devices are at hand: which Mac this
/// is, whether it will work away from home (and the fix if not), and whether to
/// be told when an agent needs you.
struct PairedSummarySheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let summary: PairedSummary
    @State private var tailscale = BuiltInTailscale.shared
    @State private var notifications: UNAuthorizationStatus?

    private var record: MacRecord? { model.macs.first { $0.localId == summary.macId } }

    private enum Away { case ready, app, turnOnHere, finishHere, macNotSetUp }

    private var away: Away {
        guard let record, record.hosts.contains(where: { AddressKind.of($0).worksAway }) else { return .macNotSetUp }
        guard tailscale.enabled else {
            return UserDefaults.standard.bool(forKey: LinkStore.usesTailscaleAppKey) ? .app : .turnOnHere
        }
        return tailscale.status.state == "running" ? .ready : .finishHere
    }

    /// How this pairing reached the Mac.
    private var overTailscale: Bool { model.link.host.map { AddressKind.of($0) == .tailscale } ?? false }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    VStack(spacing: 10) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 48))
                            .foregroundStyle(.green)
                        Text("Connected to \(record?.displayName ?? "your Mac")")
                            .font(.title2.weight(.bold))
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 12)

                    VStack(spacing: 0) {
                        awayRow
                        Divider().padding(.leading, 58)
                        row(icon: overTailscale ? "network" : "wifi", tint: .gray,
                            title: overTailscale ? "Over Tailscale" : "On this Wi-Fi", detail: nil) {
                            Text("Works").font(.subheadline.weight(.semibold)).foregroundStyle(.green)
                        }
                        Divider().padding(.leading, 58)
                        notificationsRow
                    }
                    .background(Color(uiColor: .secondarySystemGroupedBackground),
                                in: RoundedRectangle(cornerRadius: 18, style: .continuous))

                    Button {
                        dismiss()
                    } label: {
                        Text("Done").font(.headline).frame(maxWidth: .infinity, minHeight: 50)
                    }
                    .buttonStyle(.borderedProminent)
                    .buttonBorderShape(.roundedRectangle(radius: 14))
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 24)
            }
            .background(Color(uiColor: .systemGroupedBackground).ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .task { await refreshNotifications() }
        }
        .presentationDetents([.large])
    }

    @ViewBuilder
    private var awayRow: some View {
        switch away {
        case .ready:
            row(icon: "network", tint: .blue, title: "Away from home",
                detail: "Works on cellular and any Wi-Fi.") {
                Text("Ready").font(.subheadline.weight(.semibold)).foregroundStyle(.green)
            }
        case .app:
            row(icon: "network", tint: .blue, title: "Away from home",
                detail: "Works while the Tailscale app is connected on this iPhone.") {
                Text("Ready").font(.subheadline.weight(.semibold)).foregroundStyle(.green)
            }
        case .turnOnHere, .finishHere:
            row(icon: "network", tint: .blue, title: "Away from home",
                detail: away == .finishHere
                    ? "Finish setting up Built-in Tailscale on this iPhone to use lpm on cellular."
                    : "Turn on Built-in Tailscale on this iPhone to use lpm on cellular.") {
                NavigationLink {
                    TailnetSettingsView()
                } label: {
                    Text(away == .finishHere ? "Finish" : "Set up").font(.subheadline.weight(.semibold))
                }
                .buttonStyle(.bordered)
                .buttonBorderShape(.capsule)
                .controlSize(.small)
            }
        case .macNotSetUp:
            row(icon: "network", tint: .gray, title: "Away from home",
                detail: "Works on this Wi-Fi only. Set up Tailscale on the Mac (lpm → Settings → Mobile devices) and on this iPhone to use lpm anywhere.") {
                NavigationLink {
                    TailnetSettingsView()
                } label: {
                    Text("Set up").font(.subheadline.weight(.semibold))
                }
                .buttonStyle(.bordered)
                .buttonBorderShape(.capsule)
                .controlSize(.small)
            }
        }
    }

    @ViewBuilder
    private var notificationsRow: some View {
        row(icon: "bell.badge.fill", tint: .red, title: "Notifications",
            detail: "Know when an agent needs you.") {
            switch notifications {
            case .notDetermined:
                Button("Allow") {
                    model.allowNotifications { _ in Task { await refreshNotifications() } }
                }
                .font(.subheadline.weight(.semibold))
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.capsule)
                .controlSize(.small)
            case .denied:
                Button("Settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                }
                .font(.subheadline.weight(.semibold))
                .buttonStyle(.bordered)
                .buttonBorderShape(.capsule)
                .controlSize(.small)
            case .none:
                EmptyView()
            default:
                Text("On").font(.subheadline.weight(.semibold)).foregroundStyle(.green)
            }
        }
    }

    private func row<Trailing: View>(icon: String, tint: Color, title: String, detail: String?,
                                     @ViewBuilder trailing: () -> Trailing) -> some View {
        HStack(alignment: .center, spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 30, height: 30)
                .background(tint, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.body.weight(.medium))
                if let detail {
                    Text(detail).font(.footnote).foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 8)
            trailing()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    private func refreshNotifications() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        notifications = settings.authorizationStatus
    }
}

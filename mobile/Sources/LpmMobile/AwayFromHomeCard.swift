import SwiftUI

/// The first thing on the pairing screen: lpm only reaches a Mac away from its
/// Wi-Fi through Tailscale, so setting that up comes before pairing — then the
/// pairing works from anywhere. People who already run the Tailscale app say so
/// and move on; pairing for this Wi-Fi only is a choice made knowingly.
struct AwayFromHomeCard: View {
    @Binding var localOnly: Bool
    @State private var tailscale = BuiltInTailscale.shared
    @State private var settingUp = false
    @AppStorage(LinkStore.usesTailscaleAppKey) private var usesApp = false

    private enum Phase { case ready, app, inProgress, notSetUp, localOnly }

    private var phase: Phase {
        if tailscale.enabled && tailscale.status.state == "running" { return .ready }
        if !tailscale.enabled && usesApp { return .app }
        if localOnly { return .localOnly }
        return tailscale.enabled ? .inProgress : .notSetUp
    }

    /// Whether pairing here will work away from home.
    static func worksAnywhere(_ tailscale: BuiltInTailscale, usesApp: Bool) -> Bool {
        tailscale.enabled ? tailscale.status.state == "running" : usesApp
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 14) {
                Image(systemName: icon.symbol)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 42, height: 42)
                    .background(icon.tint, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(.headline)
                    Text(detail)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            switch phase {
            case .notSetUp:
                Button {
                    settingUp = true
                } label: {
                    Text("Set up Built-in Tailscale").font(.headline).frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.roundedRectangle(radius: 12))
                Button("I use the Tailscale app") { usesApp = true }
                    .font(.subheadline)
                    .frame(maxWidth: .infinity)
                localOnlyButton
            case .inProgress:
                Button {
                    settingUp = true
                } label: {
                    Text(tailscale.status.state == "needsLogin" ? "Finish signing in" : "Open Built-in Tailscale")
                        .font(.headline).frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
                .buttonBorderShape(.roundedRectangle(radius: 12))
                localOnlyButton
            case .localOnly:
                Button {
                    settingUp = true
                } label: {
                    Text("Set up Built-in Tailscale").font(.headline).frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
                .buttonBorderShape(.roundedRectangle(radius: 12))
            case .app:
                Button("Use Built-in Tailscale instead") { usesApp = false; settingUp = true }
                    .font(.subheadline)
            case .ready:
                EmptyView()
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(uiColor: .secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .sheet(isPresented: $settingUp) {
            NavigationStack {
                TailnetSettingsView()
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { settingUp = false }.fontWeight(.semibold)
                        }
                    }
            }
        }
    }

    private var icon: (symbol: String, tint: Color) {
        switch phase {
        case .ready, .app: return ("checkmark", .green)
        case .localOnly: return ("wifi", .orange)
        case .inProgress, .notSetUp: return ("network", .blue)
        }
    }

    private var localOnlyButton: some View {
        Button("Pair for this Wi-Fi only") { localOnly = true }
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity)
    }

    private var title: String {
        switch phase {
        case .ready: return "Works anywhere"
        case .app: return "Works anywhere with the Tailscale app"
        case .inProgress: return "Finish setting up Tailscale"
        case .notSetUp: return "Use lpm anywhere"
        case .localOnly: return "Pairing for this Wi-Fi only"
        }
    }

    private var detail: String {
        switch phase {
        case .ready: return "Built-in Tailscale is on. Pairing works on cellular and any Wi-Fi."
        case .app: return "Keep it connected on this iPhone, signed in to the same account as your Mac."
        case .inProgress:
            switch tailscale.status.state {
            case "needsLogin": return "Sign in with the Tailscale account you use on your Mac."
            case "needsApproval": return "Waiting for an admin to approve this iPhone."
            case "error", "stopped": return tailscale.status.error ?? "Built-in Tailscale can't connect."
            default: return "Connecting to Tailscale…"
            }
        case .notSetUp:
            return "Set up Tailscale first, so pairing also works on cellular. Without it, lpm only works on your Mac's Wi-Fi."
        case .localOnly:
            return "lpm will reach your Mac only while this iPhone is on its Wi-Fi — not on cellular or other networks. Set up Tailscale any time to use it anywhere."
        }
    }
}

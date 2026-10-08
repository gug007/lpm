import SwiftUI

/// The pairing screen's way into Built-in Tailscale, for pairing away from the
/// Mac's Wi-Fi before there is any Settings screen to reach it from.
struct TailnetPairingRow: View {
    @State private var tailscale = BuiltInTailscale.shared
    @State private var open = false

    private var title: String {
        if tailscale.enabled && tailscale.isRunning { return "Built-in Tailscale is connected" }
        return "Away from home? Set up Built-in Tailscale"
    }

    var body: some View {
        Button {
            open = true
        } label: {
            Label(title, systemImage: "network")
                .font(.subheadline)
                .frame(maxWidth: .infinity)
        }
        .sheet(isPresented: $open) {
            NavigationStack {
                TailnetSettingsView()
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { open = false }.fontWeight(.semibold)
                        }
                    }
            }
        }
    }
}

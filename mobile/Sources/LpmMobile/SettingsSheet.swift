import SwiftUI

struct SettingsSheet: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage(AppearanceMode.storageKey) private var appearanceRaw = AppearanceMode.system.rawValue
    @State private var tailscale = BuiltInTailscale.shared

    private var tailscaleSummary: String {
        guard tailscale.enabled else { return "Off" }
        switch tailscale.status.state {
        case "running": return "Connected"
        case "needsLogin": return "Sign in"
        case "needsApproval": return "Waiting"
        case "error", "stopped": return "Problem"
        default: return "Connecting…"
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    NavigationLink {
                        TailnetSettingsView()
                    } label: {
                        LabeledContent {
                            Text(tailscaleSummary)
                        } label: {
                            Label("Built-in Tailscale", systemImage: "network")
                        }
                    }
                } header: {
                    Text("Away from home")
                } footer: {
                    Text("Reach your Mac over cellular or any network, no Tailscale app needed.")
                }

                Section("Appearance") {
                    Picker("Theme", selection: $appearanceRaw) {
                        ForEach(AppearanceMode.allCases) { mode in
                            Label(mode.label, systemImage: mode.systemImage).tag(mode.rawValue)
                        }
                    }
                }

                Section {
                    TerminalSettingsControls()
                } header: {
                    Text("Terminal")
                } footer: {
                    Text("Font size and color scheme for the built-in terminal.")
                }

                Section {
                    NavigationLink {
                        SpeechSettingsView()
                    } label: {
                        Label("Read aloud", systemImage: "speaker.wave.2")
                    }
                    NavigationLink {
                        NotificationSettingsView()
                    } label: {
                        Label("Notifications", systemImage: "bell.badge")
                    }
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .fontWeight(.semibold)
                }
            }
        }
    }
}

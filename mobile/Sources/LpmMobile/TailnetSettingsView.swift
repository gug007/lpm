import SwiftUI

/// Settings → Built-in Tailscale: puts this phone on the user's tailnet without
/// the Tailscale app, so it reaches a Mac from cellular or any other network.
struct TailnetSettingsView: View {
    @State private var tailscale = BuiltInTailscale.shared
    @State private var page: WebPage?
    @State private var busy = false
    @State private var failure: String?
    @State private var confirmSignOut = false

    private struct WebPage: Identifiable {
        let url: URL
        var id: String { url.absoluteString }
    }

    private var status: BuiltInTailscale.Status { tailscale.status }

    var body: some View {
        Form {
            Section {
                Toggle("Built-in Tailscale", isOn: Binding(
                    get: { tailscale.enabled },
                    set: { tailscale.setEnabled($0); failure = nil }
                ))
            } footer: {
                Text("Reach your Mac from cellular or any Wi-Fi without installing the Tailscale app. Sign in with the same Tailscale account you use on your Mac.")
            }

            if tailscale.enabled {
                statusSection
            }

            Section {
                step(1, "On your Mac, open lpm → Settings → Mobile devices and set up Built-in Tailscale.")
                step(2, "Turn it on here and sign in with the same Tailscale account.")
                step(3, "Open lpm once on your home Wi-Fi so the app learns your Mac's tailnet address — or pair again.")
            } header: {
                Text("How it works")
            } footer: {
                Text("Built-in Tailscale runs while lpm is open. It joins your tailnet as \(tailscale.deviceName), and your Tailscale account is free for personal use.")
            }
        }
        .navigationTitle("Built-in Tailscale")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $page) { page in
            SafariView(url: page.url).ignoresSafeArea()
        }
        .onChange(of: status.state) { _, state in
            if state == "running" { page = nil }
            if ["running", "needsApproval"].contains(state) { failure = nil }
        }
        .onChange(of: status.authURL) { _, raw in
            // A node that restarted mid sign-in asks for a fresh page; keep the
            // open one current.
            if page != nil, let raw, let url = URL(string: raw) { page = WebPage(url: url) }
        }
        .confirmationDialog("Sign out of Tailscale?", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Sign Out", role: .destructive) { Task { await signOut() } }
        } message: {
            Text("This phone leaves your tailnet. Your Macs stay reachable here on the same Wi-Fi.")
        }
    }

    @ViewBuilder
    private var statusSection: some View {
        Section {
            HStack(spacing: 10) {
                Circle().fill(statusColor).frame(width: 8, height: 8)
                Text(statusLabel)
                Spacer()
                if busy || status.state == "starting" { ProgressView() }
            }

            switch status.state {
            case "needsLogin":
                Button {
                    Task { await signIn() }
                } label: {
                    Label("Sign in with Tailscale", systemImage: "person.crop.circle.badge.checkmark")
                }
                .disabled(busy)
            case "needsApproval":
                if let account = status.account { LabeledContent("Account", value: account) }
                Button {
                    page = WebPage(url: BuiltInTailscale.adminURL)
                } label: {
                    Label("Open admin console", systemImage: "checkmark.shield")
                }
                Button("Sign Out", role: .destructive) { confirmSignOut = true }
                    .disabled(busy)
            case "running":
                if let account = status.account { LabeledContent("Account", value: account) }
                if let ip = status.ip {
                    LabeledContent("Address") { Text(ip).monospaced().textSelection(.enabled) }
                }
                Button("Sign Out", role: .destructive) { confirmSignOut = true }
                    .disabled(busy)
            case "stopped":
                Button {
                    page = WebPage(url: BuiltInTailscale.adminURL)
                } label: {
                    Label("Open admin console", systemImage: "checkmark.shield")
                }
            case "error":
                Button("Try Again") {
                    tailscale.setEnabled(false)
                    tailscale.setEnabled(true)
                }
            default:
                EmptyView()
            }
        } footer: {
            if let message = failure ?? status.error {
                Text(message).foregroundStyle(.red)
            } else if status.state == "needsApproval" {
                Text("Your tailnet asks an admin to approve new devices. Approve \(tailscale.deviceName) and this phone connects on its own, or sign out to use a different account.")
            }
        }
    }

    private func step(_ number: Int, _ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text("\(number)")
                .font(.caption.weight(.semibold).monospacedDigit())
                .foregroundStyle(.secondary)
                .frame(width: 18, height: 18)
                .background(Circle().fill(Color(.tertiarySystemFill)))
            Text(text).font(.subheadline)
        }
    }

    private var statusLabel: String {
        switch status.state {
        case "running": return "Connected"
        case "needsLogin": return "Sign in to finish setting up"
        case "needsApproval": return "Waiting for approval"
        case "stopped": return "Blocked by your tailnet's settings"
        case "error": return "Couldn't connect to Tailscale"
        default: return "Connecting…"
        }
    }

    private var statusColor: Color {
        switch status.state {
        case "running": return .green
        case "error", "stopped": return .red
        default: return .orange
        }
    }

    private func signIn() async {
        busy = true
        failure = nil
        defer { busy = false }
        do {
            if let url = try await tailscale.signIn() { page = WebPage(url: url) }
        } catch {
            failure = error.localizedDescription
        }
    }

    private func signOut() async {
        busy = true
        failure = nil
        defer { busy = false }
        do {
            try await tailscale.signOut()
        } catch {
            failure = error.localizedDescription
        }
    }
}

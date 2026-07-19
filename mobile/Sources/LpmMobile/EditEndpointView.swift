import SwiftUI

/// Edit the addresses and port the phone uses to reach the active Mac, without
/// re-pairing (the saved credential is untouched). The phone tries the addresses
/// in order and connects to whichever it can reach, so more than one can be kept
/// — e.g. a local-network address for home and a Tailscale address for away.
/// Saving reconnects to the Mac on the updated addresses.
struct EditEndpointView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    @State private var hosts: [HostField] = []
    @State private var port = ""

    private struct HostField: Identifiable, Equatable {
        let id = UUID()
        var text: String
    }

    private var cleanedHosts: [String] {
        hosts.map { $0.text.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
    }

    private var portValue: Int? {
        guard let p = Int(port), (1...65535).contains(p) else { return nil }
        return p
    }

    private var canSave: Bool {
        !cleanedHosts.isEmpty
            && cleanedHosts.allSatisfy(EditEndpointView.isPlausibleHost)
            && portValue != nil
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ForEach($hosts) { $host in
                        TextField("Address", text: $host.text)
                            .keyboardType(.URL)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                    .onDelete { hosts.remove(atOffsets: $0) }
                    .onMove { hosts.move(fromOffsets: $0, toOffset: $1) }

                    Button {
                        hosts.append(HostField(text: ""))
                    } label: {
                        Label("Add address", systemImage: "plus.circle.fill")
                    }
                } header: {
                    Text("Addresses")
                } footer: {
                    Text("The phone tries these in order and connects to whichever it can reach — your Mac's local-network address, and its Tailscale address when you're away.")
                }

                Section("Port") {
                    TextField("Port", text: $port)
                        .keyboardType(.numberPad)
                }
            }
            .navigationTitle("Edit Address")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarLeading) {
                    EditButton()
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        if let p = portValue {
                            model.updateActiveMacEndpoint(hosts: cleanedHosts, port: UInt16(p))
                        }
                        dismiss()
                    }
                    .fontWeight(.semibold)
                    .disabled(!canSave)
                }
            }
            .onAppear(perform: seed)
        }
    }

    private func seed() {
        let record = model.activeRecord
        let existing = record?.hosts ?? []
        hosts = existing.isEmpty ? [HostField(text: "")] : existing.map { HostField(text: $0) }
        port = String(record?.port ?? MacStore.defaultPort)
    }

    /// A host is plausible when it's non-empty and carries no scheme, path, or
    /// whitespace — a bare IP address (IPv4 or IPv6) or hostname (e.g. `mac.local`).
    private static func isPlausibleHost(_ s: String) -> Bool {
        !s.isEmpty && !s.contains(" ") && !s.contains("/")
    }
}

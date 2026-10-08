import SwiftUI

/// The addresses and port the phone uses to reach a saved Mac, edited without
/// re-pairing (the saved credential is untouched). Each address says what it is
/// and whether it answers from here, and can be tested before saving. The phone
/// tries them all and connects to whichever answers.
struct EditEndpointView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let macId: UUID

    @State private var hosts: [HostField] = []
    @State private var port = ""
    @State private var discovery = MacDiscovery()
    @State private var finding = false
    @State private var findResult: String?

    private struct HostField: Identifiable, Equatable {
        let id = UUID()
        var text: String
    }

    private var record: MacRecord? { model.macs.first { $0.localId == macId } }

    private var cleanedHosts: [String] {
        hosts.map { $0.text.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
    }

    private var portValue: Int? {
        guard let p = Int(port), (1...65535).contains(p) else { return nil }
        return p
    }

    private var canSave: Bool {
        !cleanedHosts.isEmpty && cleanedHosts.allSatisfy(Self.isPlausibleHost) && portValue != nil
    }

    var body: some View {
        Form {
            Section {
                ForEach($hosts) { $field in
                    AddressField(text: $field.text,
                                 inUse: macId == model.activeMacId && model.link.isReady
                                    && field.text.trimmingCharacters(in: .whitespaces) == model.link.host)
                }
                .onDelete { hosts.remove(atOffsets: $0) }
                .onMove { hosts.move(fromOffsets: $0, toOffset: $1) }

                Button {
                    Task { await test() }
                } label: {
                    Label("Test addresses", systemImage: "checkmark.circle")
                }
                .disabled(cleanedHosts.isEmpty || portValue == nil || !model.link.testing.isEmpty)
                if record?.serverId != nil {
                    Button {
                        find()
                    } label: {
                        HStack {
                            Label("Find on this Wi-Fi", systemImage: "wifi")
                            if finding { Spacer(); ProgressView().controlSize(.small) }
                        }
                    }
                    .disabled(finding)
                }
                Button {
                    hosts.append(HostField(text: ""))
                } label: {
                    Label("Add address", systemImage: "plus.circle")
                }
            } header: {
                Text("Ways to reach \(record?.displayName ?? "it")")
            } footer: {
                VStack(alignment: .leading, spacing: 4) {
                    if let findResult { Text(findResult) }
                    Text("A home network address not answering is normal while you're away. Add its Tailscale address to reach it from anywhere.")
                }
            }

            Section("Port") {
                TextField("Port", text: $port)
                    .keyboardType(.numberPad)
            }
        }
        .navigationTitle("Addresses")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") {
                    if let p = portValue {
                        model.updateEndpoint(of: macId, hosts: cleanedHosts, port: UInt16(p))
                    }
                    dismiss()
                }
                .fontWeight(.semibold)
                .disabled(!canSave)
            }
            ToolbarItem(placement: .topBarTrailing) {
                EditButton()
            }
        }
        .onAppear(perform: seed)
        .onDisappear { discovery.stop() }
        .task { await test() }
    }

    private func seed() {
        guard hosts.isEmpty else { return }
        let existing = record?.hosts ?? []
        hosts = existing.isEmpty ? [HostField(text: "")] : existing.map { HostField(text: $0) }
        port = String(record?.port ?? MacStore.defaultPort)
    }

    private func test() async {
        guard let p = portValue else { return }
        await model.link.test(cleanedHosts, port: p, updatingIssue: false)
    }

    /// Look for this Mac on the current Wi-Fi and add the address it answers at.
    private func find() {
        guard let serverId = record?.serverId else { return }
        finding = true
        findResult = nil
        discovery.start()
        Task {
            defer { finding = false; discovery.stop() }
            for _ in 0..<16 {
                if let mac = discovery.found.first(where: { $0.serverId == serverId }),
                   let resolved = await discovery.resolve(mac) {
                    if !cleanedHosts.contains(resolved.host) {
                        hosts.insert(HostField(text: resolved.host), at: 0)
                    }
                    port = String(resolved.port)
                    findResult = "Found it at \(resolved.host)."
                    await test()
                    return
                }
                try? await Task.sleep(nanoseconds: 500_000_000)
            }
            findResult = "Not found on this Wi-Fi. Make sure lpm is open on it and both are on the same network."
        }
    }

    /// A bare IP address (IPv4 or IPv6) or hostname: no scheme, path or spaces.
    private static func isPlausibleHost(_ s: String) -> Bool {
        !s.isEmpty && !s.contains(" ") && !s.contains("/")
    }
}

/// An editable address with its kind under it and its check result beside it.
private struct AddressField: View {
    @Environment(AppModel.self) private var model
    @Binding var text: String
    let inUse: Bool

    private var host: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                TextField("Address", text: $text)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .monospaced()
                if !host.isEmpty {
                    Text(AddressKind.of(host).label).font(.caption).foregroundStyle(.secondary)
                }
            }
            if !host.isEmpty { result }
        }
    }

    @ViewBuilder
    private var result: some View {
        if inUse {
            Text("In use").font(.subheadline.weight(.semibold)).foregroundStyle(.green)
        } else if model.link.testing.contains(host) {
            ProgressView().controlSize(.small)
        } else if let check = model.link.checks[host] {
            Text(check.reachable ? "Answers" : "Not here")
                .font(.subheadline)
                .foregroundStyle(check.reachable ? AnyShapeStyle(.green) : AnyShapeStyle(.secondary))
        }
    }
}

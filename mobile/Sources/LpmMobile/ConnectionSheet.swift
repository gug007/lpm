import SwiftUI

/// Behind the status line: how the phone reaches the active Mac, each saved
/// address and whether it answers, the problem and its fix when there is one,
/// and every action on the Mac itself.
struct ConnectionSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var renaming = false
    @State private var renameText = ""
    @State private var removing = false
    @State private var tailscale = BuiltInTailscale.shared

    private var record: MacRecord? { model.activeRecord }

    var body: some View {
        NavigationStack {
            List {
                if let record {
                    header(record)
                    if let issue = model.link.issue, !issue.isConnecting || model.link.slowConnect {
                        Section {
                            IssueCard(issue: issue, hidesDetails: true) { action in
                                if Self.opensSheet(action) {
                                    model.link.afterSheetCloses { model.perform(action, for: issue) }
                                    dismiss()
                                } else {
                                    model.perform(action, for: issue)
                                }
                            }
                            .listRowInsets(EdgeInsets())
                            .listRowBackground(Color.clear)
                        }
                    }
                    addresses(record)
                    thisPhone
                    machine(record)
                    details(record)
                }
            }
            .navigationTitle("Connection")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }.fontWeight(.semibold)
                }
            }
            .task { await testAll() }
            .refreshable { await testAll() }
            .alert("Rename", isPresented: $renaming) {
                TextField("Name", text: $renameText)
                Button("Cancel", role: .cancel) {}
                Button("Save") { if let id = record?.localId { model.renameMac(id, to: renameText) } }
            } message: {
                Text("Leave blank to use the name it reports.")
            }
            .alert(removeTitle, isPresented: $removing) {
                Button("Remove", role: .destructive) {
                    guard let id = record?.localId else { return }
                    dismiss()
                    model.removeMac(id)
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text(removeMessage)
            }
        }
    }

    /// Actions that put up a sheet of their own, which can only appear once
    /// this one has gone.
    private static func opensSheet(_ action: IssueAction) -> Bool {
        [.pairAgain, .compareCode, .turnOnTailscale, .signInTailscale, .tailscaleSettings].contains(action)
    }

    private func testAll() async {
        guard let record else { return }
        await model.link.test(record.hosts, port: Int(record.port), updatingIssue: true)
    }

    private func header(_ record: MacRecord) -> some View {
        Section {
            HStack(spacing: 14) {
                Image(systemName: record.isLinuxHost ? "server.rack" : "desktopcomputer")
                    .font(.system(size: 22, weight: .medium))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(model.link.isReady ? Color.green : Color.gray,
                                in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                VStack(alignment: .leading, spacing: 4) {
                    Text(record.displayName).font(.title3.weight(.semibold)).lineLimit(1)
                    LinkStatusLabel(line: model.link.statusLine, detail: sinceText(record))
                }
            }
            .padding(.vertical, 4)
        }
    }

    private func sinceText(_ record: MacRecord) -> String? {
        if let since = model.link.connectedSince {
            return "since \(since.formatted(date: .omitted, time: .shortened))"
        }
        guard !model.link.isReady, let last = record.lastConnected else { return nil }
        return "last connected \(last.formatted(.relative(presentation: .named)))"
    }

    // MARK: addresses

    private func addresses(_ record: MacRecord) -> some View {
        let hosts = record.hosts.sorted { AddressKind.of($0).sortRank < AddressKind.of($1).sortRank }
        let hasAway = hosts.contains { AddressKind.of($0).worksAway }
        return Section {
            ForEach(hosts, id: \.self) { host in
                AddressStatusRow(host: host, inUse: model.link.isReady && host == model.link.host)
            }
            Button {
                Task { await testAll() }
            } label: {
                Label("Test again", systemImage: "arrow.clockwise")
            }
            .disabled(!model.link.testing.isEmpty)
        } header: {
            Text("Ways to reach it")
        } footer: {
            if !hasAway {
                Text("Only its home network address is saved, so it works on that Wi-Fi only. Set up Tailscale on the Mac in lpm → Settings → Mobile devices; lpm Link adds its new address the next time it connects.")
            } else {
                Text("A home network address not answering is normal while you're away.")
            }
        }
    }

    private var thisPhone: some View {
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
            Text("This iPhone")
        } footer: {
            Text("Reaches your Mac from cellular or any Wi-Fi, no Tailscale app needed.")
        }
    }

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

    private func machine(_ record: MacRecord) -> some View {
        Section(record.displayName) {
            NavigationLink {
                EditEndpointView(macId: record.localId)
            } label: {
                Label("Addresses", systemImage: "point.3.connected.trianglepath.dotted")
            }
            Button {
                renameText = record.displayName
                renaming = true
            } label: {
                Label("Rename", systemImage: "pencil")
            }
            Button {
                model.link.afterSheetCloses { model.repairActiveMac(reason: .chosen) }
                dismiss()
            } label: {
                Label("Pair again", systemImage: "macbook.and.iphone")
            }
            Button(role: .destructive) {
                removing = true
            } label: {
                Label("Remove from this iPhone", systemImage: "trash")
                    .foregroundStyle(.red)
            }
        }
    }

    private func details(_ record: MacRecord) -> some View {
        Section {
            DisclosureGroup("Details") {
                LabeledContent("Port", value: String(record.port))
                if let host = model.link.host {
                    LabeledContent("Address in use") { Text(host).monospaced() }
                }
                ForEach(record.hosts, id: \.self) { host in
                    if let check = model.link.checks[host] {
                        LabeledContent(host) { Text(check.detail) }
                            .monospaced()
                            .font(.footnote)
                    }
                }
                if let chain = model.client?.lastTransportErrorChain {
                    LabeledContent("Last error", value: chain)
                }
            }
        }
    }

    private var removeTitle: String {
        guard let record else { return "Remove this Mac?" }
        return record.isAddressName ? "Remove this Mac?" : "Remove “\(record.displayName)”?"
    }

    private var removeMessage: String {
        let next = model.nextMacAfterRemoval.map { " You’ll switch to “\($0.displayName)”." } ?? ""
        return "This iPhone will be unpaired and its notifications will stop.\(next) To add it back, pair it again."
    }
}

/// One saved address: what kind it is and whether it answers from here.
struct AddressStatusRow: View {
    @Environment(AppModel.self) private var model
    let host: String
    var inUse = false

    var body: some View {
        let kind = AddressKind.of(host)
        HStack(spacing: 12) {
            Image(systemName: kind.symbol)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 29, height: 29)
                .background(kind == .tailscale ? Color.blue : Color.gray,
                            in: RoundedRectangle(cornerRadius: 7, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(host).monospaced().lineLimit(1).truncationMode(.middle)
                Text(kind.label).font(.footnote).foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            result
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
        } else {
            Text("Not checked").font(.subheadline).foregroundStyle(.tertiary)
        }
    }
}

extension AddressKind {
    var symbol: String {
        switch self {
        case .tailscale: return "network"
        case .home: return "wifi"
        case .localName: return "house"
        case .thisDevice: return "iphone"
        case .internet: return "globe"
        }
    }

    /// Tailscale first: it's the address that works from anywhere.
    var sortRank: Int {
        switch self {
        case .tailscale: return 0
        case .internet: return 1
        case .home: return 2
        case .localName: return 3
        case .thisDevice: return 4
        }
    }
}

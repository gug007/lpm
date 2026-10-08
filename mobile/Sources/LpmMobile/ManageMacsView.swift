import SwiftUI

/// Every saved machine in one place: whether each answers right now, and its
/// name, addresses and removal — for the ones that aren't live as well as the
/// one that is.
struct ManageMacsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(model.macs) { mac in
                        NavigationLink {
                            MacDetailView(macId: mac.localId)
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: mac.isLinuxHost ? "server.rack" : "desktopcomputer")
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundStyle(.white)
                                    .frame(width: 30, height: 30)
                                    .background(Color.gray, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(mac.displayName).lineLimit(1)
                                    Text(status(of: mac)).font(.footnote).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                } footer: {
                    Text("lpm Link connects to one machine at a time. Switch from the name at the top of the projects list.")
                }
                Section {
                    Button {
                        dismiss()
                        model.link.afterSheetCloses { model.beginAddMac() }
                    } label: {
                        Label("Add a machine…", systemImage: "plus")
                    }
                }
            }
            .navigationTitle("Machines")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }.fontWeight(.semibold)
                }
            }
            .task { model.link.refreshReach(force: true) }
        }
    }

    private func status(of mac: MacRecord) -> String {
        if mac.localId == model.activeMacId { return "In use · " + model.link.statusLine.text }
        return MacSwitcherMenu.reachText(model.link.reach[mac.localId], lastConnected: mac.lastConnected)
    }
}

/// One saved machine: rename it, edit how the phone reaches it, or remove it.
private struct MacDetailView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let macId: UUID
    @State private var name = ""
    @State private var removing = false

    private var record: MacRecord? { model.macs.first { $0.localId == macId } }

    var body: some View {
        Form {
            if let record {
                Section {
                    TextField(record.name, text: $name)
                        .onSubmit { model.renameMac(macId, to: name) }
                } header: {
                    Text("Name")
                } footer: {
                    Text("Leave blank to use the name it reports.")
                }
                Section {
                    NavigationLink {
                        EditEndpointView(macId: macId)
                    } label: {
                        LabeledContent("Addresses", value: "\(record.hosts.count)")
                    }
                    if record.localId != model.activeMacId {
                        Button("Switch to it") {
                            model.switchTo(record)
                            model.link.manageOpen = false
                        }
                    }
                }
                Section {
                    Button("Remove from this iPhone", role: .destructive) { removing = true }
                }
            }
        }
        .navigationTitle(record?.displayName ?? "Machine")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { name = record?.customName ?? "" }
        .onDisappear { if record != nil { model.renameMac(macId, to: name) } }
        .alert("Remove “\(record?.displayName ?? "this machine")”?", isPresented: $removing) {
            Button("Remove", role: .destructive) {
                dismiss()
                model.removeMac(macId)
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This iPhone will be unpaired and its notifications will stop. To add it back, pair it again.")
        }
    }
}

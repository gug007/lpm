import SwiftUI

/// The navigation-bar title menu for choosing which saved Mac is live. Shows the
/// active Mac's name; tapping opens a menu of all saved Macs (checkmark on the
/// active one), the live Mac's own servers and Macs still being added here, and
/// "Add a Mac…". With a single saved Mac it still works as an entry point for
/// adding another.
struct MacSwitcherMenu: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Menu {
            if model.demoMode {
                Button {
                    model.exitDemo()
                } label: {
                    Label("Exit Demo", systemImage: "xmark.circle")
                }
            } else {
                ForEach(model.macs) { mac in
                    Button {
                        model.switchTo(mac)
                    } label: {
                        if mac.localId == model.activeMacId {
                            Label(mac.displayName, systemImage: "checkmark")
                        } else {
                            Label(mac.displayName,
                                  systemImage: mac.isLinuxHost ? "server.rack" : "desktopcomputer")
                        }
                    }
                }
                let pending = model.machineImporter.rows(macs: model.macs)
                if !pending.isEmpty {
                    Section("Connected to \(model.activeRecord?.displayName ?? "this Mac")") {
                        ForEach(pending) { row in
                            pendingMachine(row)
                        }
                    }
                }
                Divider()
                Button {
                    model.beginAddMac()
                } label: {
                    Label("Add a machine…", systemImage: "plus")
                }
            }
        } label: {
            HStack(spacing: 4) {
                Text(model.activeRecord?.displayName ?? "Mac")
                    .font(.headline)
                    .lineLimit(1)
                    .foregroundStyle(.primary)
                Image(systemName: "chevron.down")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
        }
    }

    /// A machine of the live Mac's that isn't on this phone yet. Tappable only
    /// when tapping can help: to retry a failure or re-add a removed one.
    @ViewBuilder
    private func pendingMachine(_ row: MachineImporter.Row) -> some View {
        let (detail, icon, tappable): (String, String, Bool) = {
            switch row.status {
            case .adding: return ("Adding…", "arrow.triangle.2.circlepath", false)
            case .failed(let why): return ("\(why) Tap to try again.", "exclamationmark.triangle", true)
            case .removed: return ("Tap to add", "plus.circle", true)
            case .offline: return ("Offline", row.machine.isLinuxHost ? "server.rack" : "desktopcomputer", false)
            case .needsUpdate: return ("Update lpm on it to add it here", "arrow.up.circle", false)
            }
        }()
        Button {
            model.machineImporter.add(row.machine.slug)
        } label: {
            Text(row.machine.name)
            Text(detail)
            Image(systemName: icon)
        }
        .disabled(!tappable)
    }
}

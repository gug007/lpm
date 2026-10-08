import SwiftUI

/// The navigation-bar title menu for choosing which saved Mac is live. Shows the
/// active Mac's name; tapping opens a menu of all saved Macs with whether each
/// answers right now (checkmark on the active one), the live Mac's own servers
/// and Macs still being added here, "Add a machine…" and "Manage machines…".
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
                        Text(mac.displayName)
                        Text(status(of: mac))
                        Image(systemName: mac.localId == model.activeMacId
                              ? "checkmark" : (mac.isLinuxHost ? "server.rack" : "desktopcomputer"))
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
                Button {
                    model.link.manageOpen = true
                } label: {
                    Label("Manage machines…", systemImage: "slider.horizontal.3")
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

    /// Whether a saved machine is reachable: the live one's own status, and for
    /// the others the last check, so switching isn't a guess.
    private func status(of mac: MacRecord) -> String {
        if mac.localId == model.activeMacId { return model.link.statusLine.text }
        return MacSwitcherMenu.reachText(model.link.reach[mac.localId], lastConnected: mac.lastConnected)
    }

    static func reachText(_ reach: MacReach?, lastConnected: Date?) -> String {
        switch reach {
        case .online?: return "Online"
        case .checking?: return "Checking…"
        default:
            guard let last = lastConnected else { return "Not answering right now" }
            return "Last connected \(last.formatted(.relative(presentation: .named)))"
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

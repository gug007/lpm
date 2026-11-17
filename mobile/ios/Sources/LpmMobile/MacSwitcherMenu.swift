import SwiftUI

/// The navigation-bar title menu for choosing which saved machines the projects
/// list shows. Shows the live Mac's name, or how many computers are listed;
/// tapping opens a menu of all saved machines with whether each answers right
/// now and a checkmark on the ones shown. Tapping a row ticks or clears it and
/// the menu stays open. Under them: the live Mac's own servers and Macs still
/// being added here, Keep Awake, "Add a machine…" and "Manage machines…". A cup
/// beside the name says the live Mac is kept awake.
struct MacSwitcherMenu: View {
    @Environment(AppModel.self) private var model
    var maxWidth: CGFloat? = nil

    var body: some View {
        Menu {
            if model.demoMode {
                KeepAwakeMenu()
                Button {
                    model.exitDemo()
                } label: {
                    Label("Exit Demo", systemImage: "xmark.circle")
                }
            } else {
                if model.macs.count > 1 {
                    Section("Show on the main page") { machineChoices }
                } else {
                    machineChoices
                }
                let pending = model.machineImporter.rows(macs: model.macs)
                if !pending.isEmpty {
                    Section("Connected to \(model.activeRecord?.displayName ?? "this Mac")") {
                        ForEach(pending) { row in
                            pendingMachine(row)
                        }
                    }
                }
                KeepAwakeMenu()
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
            WidthCap(max: maxWidth) {
                HStack(spacing: 4) {
                    Text(title)
                        .font(.headline)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .foregroundStyle(.primary)
                    if model.keepAwake.state?.isOn == true {
                        Image(systemName: "cup.and.saucer.fill")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(.orange)
                            .accessibilityLabel("Kept awake")
                    }
                    Image(systemName: "chevron.down")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var title: String {
        let count = model.shownMachineCount
        return count > 1 ? "\(count) computers" : model.activeRecord?.displayName ?? "Mac"
    }

    private var machineChoices: some View {
        ForEach(model.macs) { mac in
            Button {
                model.toggleShown(mac)
            } label: {
                Text(mac.displayName)
                Text(status(of: mac))
                Image(systemName: model.isShown(mac)
                      ? "checkmark" : (mac.isLinuxHost ? "server.rack" : "desktopcomputer"))
            }
            .menuActionDismissBehavior(.disabled)
            .accessibilityAddTraits(model.isShown(mac) ? .isSelected : [])
        }
    }

    /// Whether a saved machine is reachable: the live one's own status, and for
    /// the others the last check, so ticking one isn't a guess.
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
    /// when tapping can help: to retry a failure, re-add a removed one, or pair
    /// on a machine that removed this phone.
    @ViewBuilder
    private func pendingMachine(_ row: MachineImporter.Row) -> some View {
        let (detail, icon, tappable): (String, String, Bool) = {
            switch row.status {
            case .adding: return ("Adding…", "arrow.triangle.2.circlepath", false)
            case .failed(let why): return ("\(why) Tap to try again.", "exclamationmark.triangle", true)
            case .removed: return ("Tap to add", "plus.circle", true)
            case .revoked: return ("Removed this \(ThisDevice.noun). Pair on it to add it.", "iphone.slash", true)
            case .offline: return ("Offline", row.machine.isLinuxHost ? "server.rack" : "desktopcomputer", false)
            case .needsUpdate: return ("Update lpm on it to add it here", "arrow.up.circle", false)
            }
        }()
        Button {
            if row.status == .revoked { model.beginAddMac() } else { model.machineImporter.add(row.machine.slug) }
        } label: {
            Text(row.machine.name)
            Text(detail)
            Image(systemName: icon)
        }
        .disabled(!tappable)
    }
}

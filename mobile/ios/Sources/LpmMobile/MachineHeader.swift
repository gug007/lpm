import SwiftUI

/// The header of a machine's section in the projects list: which machine it is
/// and whether it is on this iPhone yet. Pairing it with this iPhone lives in the
/// list's "…" menu.
struct MachineHeader: View {
    @Environment(AppModel.self) private var model
    let section: MachineSection
    let expanded: Bool
    let toggle: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Button(action: toggle) {
                HStack(spacing: 8) {
                    Image(systemName: expanded ? "chevron.down" : "chevron.right")
                        .font(.caption2).foregroundStyle(.secondary)
                    Image(systemName: section.machine.isLinuxHost ? "server.rack" : "desktopcomputer")
                        .font(.subheadline).foregroundStyle(.secondary)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(section.machine.name).fontWeight(.medium).lineLimit(1)
                        if let detail {
                            Text(detail).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if opensOnlyBySwitching {
                Button("Open") { model.switchToMachine(section) }
                    .buttonStyle(.borderless)
                    .font(.subheadline.weight(.semibold))
            } else if section.machine.projects != nil {
                Text("\(section.projectCount)").font(.caption).foregroundStyle(.secondary)
            }
        }
        .contextMenu {
            if section.canOpen {
                Button { model.switchToMachine(section) } label: {
                    Label("Switch to \(section.machine.name)", systemImage: "arrow.left.arrow.right")
                }
            }
        }
    }

    private var detail: String? {
        if let note = section.note { return note }
        if section.record?.via?.macId == model.activeMacId { return "Opens through this Mac" }
        switch section.pending {
        case .adding?: return "Adding to this \(ThisDevice.noun)…"
        case .failed(let why)?: return why
        case .removed?: return section.throughMac ? "Opens through this Mac" : "Not on this \(ThisDevice.noun)"
        case .revoked?: return "Removed this \(ThisDevice.noun). Pair on it to use it here."
        case .needsUpdate?: return "Update lpm on it to open it here"
        case .offline?, nil: return nil
        }
    }

    /// A Mac too old to list a machine's projects still gets you there.
    private var opensOnlyBySwitching: Bool {
        section.machine.projects == nil && section.record != nil
    }
}

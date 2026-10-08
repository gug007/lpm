import SwiftUI

/// The header of a machine's section in the projects list: which machine it is,
/// whether it is on this iPhone yet, and the one thing to do when it isn't.
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
            if let action {
                Button(action.title, action: action.run)
                    .buttonStyle(.borderless)
                    .font(.subheadline.weight(.semibold))
            } else if section.machine.projects != nil {
                Text("\(section.projectCount)").font(.caption).foregroundStyle(.secondary)
            }
        }
        .contextMenu {
            if section.record != nil {
                Button { model.switchToMachine(section) } label: {
                    Label("Switch to \(section.machine.name)", systemImage: "arrow.left.arrow.right")
                }
            }
        }
    }

    private var detail: String? {
        switch section.pending {
        case .adding?: return "Adding to this iPhone…"
        case .failed(let why)?: return why
        case .removed?: return "Not on this iPhone"
        case .needsUpdate?: return "Update lpm on it to open it here"
        case .offline?, nil: return nil
        }
    }

    private var action: (title: String, run: () -> Void)? {
        let slug = section.machine.slug
        switch section.pending {
        case .failed?: return ("Try again", { model.machineImporter.add(slug) })
        case .removed?: return ("Add", { model.machineImporter.add(slug) })
        default: break
        }
        // A Mac too old to list a machine's projects still gets you there.
        if section.machine.projects == nil, section.record != nil {
            return ("Open", { model.switchToMachine(section) })
        }
        return nil
    }
}

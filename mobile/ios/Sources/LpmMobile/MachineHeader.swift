import SwiftUI

/// A computer's name over its card in the projects list: its glyph, its name and
/// a few words on how it is doing.
struct ComputerHeaderLabel: View {
    let linuxHost: Bool
    let name: String
    var detail: String? = nil

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: linuxHost ? "server.rack" : "desktopcomputer")
                .font(.subheadline)
                .foregroundStyle(.primary)
            Text(name)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
                .lineLimit(1)
                .layoutPriority(1)
            if let detail {
                Text(detail).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
        }
        .textCase(nil)
    }
}

/// The header over a machine's card in the projects list: which machine it is
/// and whether it is on this iPhone yet. Tapping it folds the card. Pairing it
/// with this iPhone lives in the list's "…" menu.
struct MachineHeader: View {
    @Environment(AppModel.self) private var model
    let section: MachineSection
    let expanded: Bool
    let toggle: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Button(action: toggle) {
                HStack(spacing: 8) {
                    VStack(alignment: .leading, spacing: 2) {
                        ComputerHeaderLabel(linuxHost: section.machine.isLinuxHost,
                                            name: section.machine.name, detail: detailFits ? detail : nil)
                        if let detail, !detailFits {
                            Text(detail).font(.caption).foregroundStyle(.secondary).textCase(nil)
                                .multilineTextAlignment(.leading)
                        }
                    }
                    Spacer(minLength: 0)
                    if !opensOnlyBySwitching {
                        if section.machine.projects != nil {
                            Text("\(section.projectCount)").font(.caption).foregroundStyle(.secondary)
                        }
                        Image(systemName: expanded ? "chevron.down" : "chevron.right")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint(expanded ? "Hides its projects" : "Shows its projects")
            if opensOnlyBySwitching {
                Button("Open") { model.switchToMachine(section) }
                    .buttonStyle(.borderless)
                    .font(.subheadline.weight(.semibold))
                    .textCase(nil)
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
        if section.record?.via?.macId == model.activeMacId { return throughMacDetail }
        switch section.pending {
        case .adding?: return "Adding to this \(ThisDevice.noun)…"
        case .failed(let why)?: return why
        case .removed?: return section.throughMac ? "Opens through this Mac" : "Not on this \(ThisDevice.noun)"
        case .revoked?: return "Removed this \(ThisDevice.noun). Pair on it to use it here."
        case .needsUpdate?: return "Update lpm on it to open it here"
        case .offline?, nil: return nil
        }
    }

    /// A detail short enough to sit beside the name; a longer one goes under it.
    private var detailFits: Bool { (detail?.count ?? 0) <= 24 }

    /// A machine without a pairing of its own: how pairing with it directly is
    /// going, or why it didn't.
    private var throughMacDetail: String {
        let through = "Opens through this Mac."
        switch section.pending {
        case .adding?: return "Connecting directly…"
        case .failed(let why)?: return "\(through) Couldn't connect directly: \(why)"
        case .revoked?: return "\(through) It removed this \(ThisDevice.noun): pair on it to connect directly."
        case .needsUpdate?: return "\(through) Update lpm on it to connect directly."
        case .removed?, .offline?, nil: return "Opens through this Mac"
        }
    }

    /// A Mac too old to list a machine's projects still gets you there.
    private var opensOnlyBySwitching: Bool {
        section.machine.projects == nil && section.record != nil
    }
}

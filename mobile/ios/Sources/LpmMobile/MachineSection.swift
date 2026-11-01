import Foundation

/// A machine the live Mac connects to — a Linux server or another Mac — as a
/// section of the projects list, in the slot the Mac's own sidebar gives it.
struct MachineSection: Identifiable {
    let machine: RemoteMachine
    let rows: [SidebarRow]
    /// The machine as saved on this phone; nil until it has been added here.
    let record: MacRecord?
    /// Where adding it to this phone stands, while it isn't on it.
    let pending: MachineImporter.Status?
    /// Not on this phone, but the live Mac can carry the phone to it.
    let throughMac: Bool
    /// How a machine saved here is doing, while it isn't answering.
    var note: String? = nil

    var id: String { machine.slug }
    var projectCount: Int { rows.filter { !$0.isChild }.count }
    var canOpen: Bool { record != nil || throughMac }
}

/// A machine's projects with each copy right under the project it was made
/// from, the way the Mac's sidebar nests them.
func machineRows(_ projects: [Project]) -> [SidebarRow] {
    let names = Set(projects.map(\.name))
    func hasParent(_ p: Project) -> Bool { !p.parentName.isEmpty && names.contains(p.parentName) }
    var children: [String: [Project]] = [:]
    for p in projects where hasParent(p) {
        children[p.parentName, default: []].append(p)
    }
    var out: [SidebarRow] = []
    var seen = Set<String>()
    func emit(_ p: Project, isChild: Bool) {
        guard seen.insert(p.name).inserted else { return }
        out.append(SidebarRow(project: p, isChild: isChild))
        for child in children[p.name] ?? [] { emit(child, isChild: true) }
    }
    for p in projects where !hasParent(p) { emit(p, isChild: false) }
    for p in projects { emit(p, isChild: true) }
    return out
}

extension AppModel {
    /// The live Mac's connected machines, each with its projects.
    var machineSections: [MachineSection] {
        guard !demoMode else { return [] }
        let pending = Dictionary(machineImporter.rows(macs: macs).map { ($0.machine.slug, $0.status) },
                                 uniquingKeysWith: { a, _ in a })
        // Only a Mac this phone reaches itself can carry it on to another machine.
        let relays = activeRecord?.via == nil
        return machineImporter.machines.filter(\.isConnected).map { m in
            let record = machineImporter.record(for: m, macs: macs)
            return MachineSection(machine: m,
                                  rows: machineRows(m.projects ?? []),
                                  record: record,
                                  pending: pending[m.slug],
                                  throughMac: record == nil && relays && m.relay)
        }
    }

    /// The live Mac's connected machines with their projects, as Activity and the
    /// ambient badge count them.
    var activityMachines: [ActivityMachine] {
        listedMachineSections.map {
            ActivityMachine(slug: $0.machine.slug, name: $0.machine.name, projects: $0.machine.projects ?? [])
        }
    }

    /// Every project whose agents the ambient badge counts: the Mac's own and its
    /// connected machines'.
    var ambientProjects: [Project] {
        projects + activityMachines.flatMap(\.projects)
    }

    func switchToMachine(_ section: MachineSection) {
        guard let record = section.record ?? recordThroughLiveMac(section, saving: true) else { return }
        pendingNotificationTarget = nil
        switchTo(record)
    }

    /// The entry that opens one of the live Mac's machines through it. Switching
    /// to it saves it the first time, and like a machine added here it reads as
    /// it does in that Mac's sidebar.
    func recordThroughLiveMac(_ section: MachineSection, saving: Bool) -> MacRecord? {
        guard section.throughMac, let mac = activeRecord else { return nil }
        let via = MacVia(macId: mac.localId, slug: section.machine.slug)
        if let saved = macs.first(where: { $0.via == via }) { return saved }
        let m = section.machine
        let record = MacRecord(localId: UUID(), serverId: m.serverId, name: m.name, customName: m.name,
                               hosts: [], port: mac.port, platform: m.platform, via: via)
        if saving {
            macs.append(record)
            persistMacs()
        }
        return record
    }

    /// The Mac a machine opened through another one goes through.
    func viaMac(of record: MacRecord) -> MacRecord? {
        guard let via = record.via else { return nil }
        return macs.first { $0.localId == via.macId }
    }
}

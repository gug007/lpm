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

    var id: String { machine.slug }
    var projectCount: Int { rows.filter { !$0.isChild }.count }
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
        return machineImporter.machines.filter(\.isConnected).map { m in
            MachineSection(machine: m,
                           rows: machineRows(m.projects ?? []),
                           record: machineImporter.record(for: m, macs: macs),
                           pending: pending[m.slug])
        }
    }

    /// The live Mac's connected machines with their projects, as Activity and the
    /// ambient badge count them.
    var activityMachines: [ActivityMachine] {
        machineSections.map {
            ActivityMachine(slug: $0.machine.slug, name: $0.machine.name, projects: $0.machine.projects ?? [])
        }
    }

    /// Every project whose agents the ambient badge counts: the Mac's own and its
    /// connected machines'.
    var ambientProjects: [Project] {
        projects + activityMachines.flatMap(\.projects)
    }

    /// Open a project of one of the Mac's machines: switch this phone to that
    /// machine, then go to the project (and the terminal, when one is given) once
    /// its list has loaded.
    func openOnMachine(_ section: MachineSection, project: String, terminal: String? = nil) {
        guard let record = section.record else { return }
        guard let serverId = record.serverId else {
            pendingNotificationTarget = nil
            switchTo(record)
            return
        }
        pendingNotificationTarget = NotificationOpenTarget(serverId: serverId, project: project, terminal: terminal)
    }

    func switchToMachine(_ section: MachineSection) {
        guard let record = section.record else { return }
        pendingNotificationTarget = nil
        switchTo(record)
    }
}

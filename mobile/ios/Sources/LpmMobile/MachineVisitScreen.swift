import SwiftUI

/// A machine's project, or one of its terminals, opened while the live Mac stays
/// connected. Every screen under it talks to the visit's own session.
struct MachineVisitScreen: View {
    @Environment(AppModel.self) private var model
    let visit: MachineVisit

    /// The project as the live Mac lists it, shown until the machine answers.
    private var listed: Project? {
        model.listedMachineSections.first { $0.id == visit.slug }?
            .machine.projects?.first { $0.name == visit.project }
    }

    var body: some View {
        if let session = model.visitSession {
            MachineVisitContent(visit: visit, listed: listed)
                .environment(session)
        } else {
            ContentUnavailableView("Project unavailable", systemImage: "folder")
        }
    }
}

private struct MachineVisitContent: View {
    @Environment(AppModel.self) private var model
    let visit: MachineVisit
    let listed: Project?

    private var ready: Bool { model.connection == .ready }

    var body: some View {
        Group {
            if let terminal = visit.terminal {
                NotificationTerminalDestination(projectName: visit.project, terminalId: terminal)
            } else if let project = model.projects.first(where: { $0.name == visit.project }) ?? listed {
                ProjectDetail(project: project)
                    // The screen's own first ask can go out before the session is up.
                    .task(id: ready) {
                        guard ready else { return }
                        model.loadTerminals(visit.project)
                        model.loadBackgroundRuns(visit.project)
                    }
            } else if model.projectsLoaded {
                ContentUnavailableView("Project unavailable", systemImage: "folder")
            } else {
                ProgressView()
            }
        }
        .modifier(SessionAlerts())
        .modifier(ConnectionSheets())
    }
}

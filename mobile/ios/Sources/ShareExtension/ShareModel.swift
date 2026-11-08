import Foundation

/// The share sheet's choices and where its send stands. It starts with the last
/// share's Mac, project and destination, and sends straight to the Mac; when no
/// address answers, the share waits in the app group for the app to send.
@Observable @MainActor
final class ShareModel {
    enum Phase: Equatable {
        case loading, ready, sending, sent, queued
        case failed(String)
    }

    let directory: ShareDirectory
    var items = SharedItems()
    var phase: Phase = .loading
    var note = ""
    private(set) var macId: String
    var project = ""
    var destination: PendingShare.Destination = .agent
    var agent = ""

    init(directory: ShareDirectory) {
        self.directory = directory
        let saved = ShareDirectory.Choice.mac
        let macs = directory.macs
        macId = (macs.first { $0.serverId == saved } ?? macs.first)?.serverId ?? ""
        pickDefaults()
    }

    var mac: ShareDirectory.Mac? { directory.macs.first { $0.serverId == macId } }

    func selectMac(_ serverId: String) {
        guard serverId != macId else { return }
        macId = serverId
        pickDefaults()
    }

    var projects: [ShareDirectory.Project] { mac?.projects ?? [] }
    var agents: [ShareDirectory.Agent] { mac?.agents ?? [] }
    var projectTitle: String { projects.first { $0.name == project }?.title ?? project }

    var canSend: Bool {
        phase == .ready && mac != nil && projects.contains { $0.name == project }
            && (destination == .notes || agents.contains { $0.id == agent })
            && !(items.isEmpty && note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    private func pickDefaults() {
        let projects = projects
        let savedProject = ShareDirectory.Choice.project
        project = projects.first { $0.name == savedProject }?.name ?? projects.first?.name ?? ""
        let savedAgent = ShareDirectory.Choice.agent
        agent = agents.first { $0.id == savedAgent }?.id ?? agents.first?.id ?? ""
        let savedDestination = ShareDirectory.Choice.destination.flatMap(PendingShare.Destination.init)
        destination = agents.isEmpty ? .notes : savedDestination ?? .agent
    }

    func send() async {
        guard canSend, let mac else { return }
        phase = .sending
        remember()
        let share = PendingShare(serverId: mac.serverId, macName: mac.name, project: project,
                                 projectTitle: projectTitle, destination: destination,
                                 agent: destination == .agent ? agent : "", note: note, text: items.text)
        switch await ShareDelivery.send(share, images: items.images, to: mac, phoneId: directory.phoneId) {
        case .sent:
            phase = .sent
        case .unreachable:
            do {
                try ShareInbox.save(share, images: items.images)
                phase = .queued
            } catch {
                phase = .failed("Couldn't reach \(mac.name), and couldn't keep the share for later.")
            }
        case .failed(let message):
            phase = .failed(message)
        }
    }

    func dismissFailure() {
        if case .failed = phase { phase = .ready }
    }

    private func remember() {
        ShareDirectory.Choice.mac = macId
        ShareDirectory.Choice.project = project
        ShareDirectory.Choice.destination = destination.rawValue
        if destination == .agent { ShareDirectory.Choice.agent = agent }
    }
}

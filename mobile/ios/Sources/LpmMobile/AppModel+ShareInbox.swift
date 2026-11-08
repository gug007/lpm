import SwiftUI
import UserNotifications

extension AppModel {
    /// The live Mac as the share sheet lists it: where to reach it, its local
    /// projects and its agents. Nil in Demo Mode, on a visit, and for a Mac this
    /// phone reaches only through another one.
    var shareDirectoryMac: ShareDirectory.Mac? {
        guard !demoMode, !isVisit, projectsLoaded, let record = activeRecord, record.via == nil else { return nil }
        let agents = canLaunchAgents ? (agentLaunch.options ?? []) : []
        return ShareDirectory.Mac(
            record: record,
            projects: projects.filter { !$0.isRemote }.map { .init(name: $0.name, label: $0.label) },
            agents: agents.map { .init(id: $0.id, label: $0.label) })
    }

    func publishShareDirectory() {
        guard !demoMode else { return }
        let saved = Set(macs.filter { $0.via == nil }.compactMap(\.serverId))
        ShareDirectory.load().updating(shareDirectoryMac, keeping: saved, phoneId: Keychain.phoneId).save()
    }

    /// Send what the share sheet kept for later, each to its Mac, and say how it went.
    /// A Mac that doesn't answer keeps the rest of its shares for the next time.
    func sendWaitingShares() {
        guard !demoMode, !sendingShares else { return }
        let waiting = ShareInbox.all()
        guard !waiting.isEmpty else { return }
        sendingShares = true
        let records = macs
        Task {
            var unreachable: Set<String> = []
            for share in waiting where !unreachable.contains(share.serverId) {
                guard let record = records.first(where: { $0.serverId == share.serverId && $0.via == nil }),
                      let mac = ShareDirectory.Mac(record: record) else {
                    ShareInbox.remove(share)
                    continue
                }
                let images = await Task.detached { ShareInbox.images(of: share) }.value
                let outcome = await ShareDelivery.send(share, images: images, to: mac,
                                                       phoneId: Keychain.phoneId, route: BuiltInTailscale.route)
                switch outcome {
                case .unreachable:
                    unreachable.insert(share.serverId)
                    continue
                case .sent: Self.announce(share, failure: nil)
                case .failed(let message): Self.announce(share, failure: message)
                }
                ShareInbox.remove(share)
            }
            sendingShares = false
        }
    }

    private static func announce(_ share: PendingShare, failure: String?) {
        let content = UNMutableNotificationContent()
        content.title = failure == nil ? "Sent to \(share.projectTitle)" : "Couldn't send to \(share.projectTitle)"
        content.body = failure ?? "What you shared reached \(share.macName)."
        content.threadIdentifier = share.project
        UNUserNotificationCenter.current().add(
            UNNotificationRequest(identifier: "share-\(share.id)", content: content, trigger: nil))
    }
}

extension ShareDirectory.Mac {
    /// A saved Mac as the share sheet lists it; nil until it's known by its server id.
    init?(record: MacRecord, projects: [ShareDirectory.Project] = [], agents: [ShareDirectory.Agent] = []) {
        guard let serverId = record.serverId else { return nil }
        self.init(localId: record.localId.uuidString, serverId: serverId, name: record.displayName,
                  hosts: record.hosts, port: Int(record.port), projects: projects, agents: agents)
    }
}

/// Keeps the share sheet's directory current and sends what it kept for later
/// whenever the app comes back or the link does.
struct ShareDirectoryPublisher: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Color.clear
            .task(id: model.shareDirectoryMac) { model.publishShareDirectory() }
            .task(id: model.link.isReady && model.canLaunchAgents) {
                if model.link.isReady, model.canLaunchAgents, model.agentLaunch.options == nil {
                    model.agentLaunch.loadOptions()
                }
            }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { model.sendWaitingShares() }
            }
            .onChange(of: model.link.isReady) { _, ready in
                if ready { model.sendWaitingShares() }
            }
    }
}

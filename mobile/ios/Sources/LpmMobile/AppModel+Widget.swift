import SwiftUI

extension AppModel {
    /// The live Mac's agents as the Agents widget lists them: one row per tab, as
    /// the projects list shows them. Nil while what's on screen isn't the Mac's
    /// live list — a saved copy, a pairing, a link that's down.
    var agentWidgetMac: AgentWidgetMac? {
        guard case .ready = connection, projectsLoaded, link.listAsOf == nil, !link.pairing,
              let record = activeRecord else { return nil }
        let now = Int(Date().timeIntervalSince1970 * 1000)
        let titles = agentTabTitles
        let rows = projects.flatMap { project in
            projectAgentRows(project, now: now, tabTitles: titles[project.name] ?? [:])
                .filter { $0.state != .idle }
                .map {
                    AgentWidgetRow(project: project.name, key: $0.id, terminalId: $0.terminalId,
                                   title: $0.title, state: $0.state, since: $0.since, until: $0.until)
                }
        }
        return AgentWidgetMac(id: agentWidgetId(record), name: record.displayName, rows: rows)
    }

    func agentWidgetId(_ record: MacRecord) -> String {
        record.serverId ?? record.localId.uuidString
    }

    /// Drop the widgets' rows for Macs the phone no longer has: a removed Mac, or
    /// the demo once it's left.
    func pruneWidgets() {
        guard !demoMode else { return }
        let kept = Set(macs.map(agentWidgetId))
        Task.detached(priority: .utility) {
            let gone = Set(AgentWidgetStore.load().map(\.id)).subtracting(kept)
            if !gone.isEmpty { AgentWidgetStore.remove(gone) }
            UsageWidgetStore.keep(kept)
        }
    }

    /// Where a tapped widget row goes: its terminal, on its Mac.
    func openAgentWidgetLink(_ url: URL) {
        guard let link = AgentWidgetLink.parse(url),
              let mac = macs.first(where: { agentWidgetId($0) == link.macId }) else { return }
        pendingNotificationTarget = NotificationOpenTarget(serverId: mac.serverId, project: link.project,
                                                           terminal: link.terminalId)
    }
}

/// Keeps the Agents widget in step with the live Mac, writing its rows once they
/// have settled for a second so a burst of status changes is one write. Leaving the
/// app stamps them as seen then, the last the phone hears of the Mac until it's back.
struct AgentWidgetPublisher: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        let mac = model.agentWidgetMac
        Color.clear
            .task(id: mac) {
                guard let mac else { return }
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                guard !Task.isCancelled else { return }
                await Task.detached(priority: .utility) { AgentWidgetStore.publish(mac) }.value
            }
            .onChange(of: scenePhase) { _, phase in
                guard phase == .inactive, let mac else { return }
                Task.detached(priority: .utility) { AgentWidgetStore.confirm(mac) }
            }
    }
}

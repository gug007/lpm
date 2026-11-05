import Foundation
import WidgetKit

/// One agent tab as the Agents widget lists it: what the tab is called, what its
/// agent is doing, and what its reading counts from — the same fields the projects
/// list's agent rows read.
struct AgentWidgetRow: Codable, Equatable {
    var project: String
    /// The status entry key, unique within its project.
    var key: String
    var terminalId: String?
    var title: String
    var state: AgentState
    /// Millis the reading counts from; nil when the turn was never seen starting.
    var since: Int?
    /// Millis the turn ended, freezing a done row at how long the work took.
    var until: Int?

    func elapsed(now: Int) -> String? {
        since.map { shortDuration(millis: (until ?? now) - $0) }
    }
}

/// One saved Mac's agents, as the app last saw them live or a push since told.
struct AgentWidgetMac: Codable, Equatable {
    /// The Mac's server id, or its local id for a Mac too old to send one.
    var id: String
    /// The Mac's name as the phone shows it; nil until the app has seen it live.
    var name: String? = nil
    var rows: [AgentWidgetRow]
    /// Millis the phone last heard this Mac's agents.
    var seenAt: Int? = nil
}

/// A row and the Mac it runs on, in the order the widget lists them.
struct AgentWidgetItem: Equatable {
    var macId: String
    var row: AgentWidgetRow
}

/// The Agents widget's data: a file in the app group, written by the app while a
/// Mac is live and by the notification extension when a push says an agent moved
/// on, read by the widget. Each write asks the widget to redraw.
enum AgentWidgetStore {
    static let kind = "AgentList"
    private static let appGroup = "group.cx.lpm.mobile"

    private static var url: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
            .appendingPathComponent("agent-widget.json")
    }

    static func load() -> [AgentWidgetMac] {
        guard let url, let data = try? Data(contentsOf: url) else { return [] }
        return (try? JSONDecoder().decode([AgentWidgetMac].self, from: data)) ?? []
    }

    /// Every Mac's agents, most urgent first and the longest at it first within a
    /// state.
    static func items(_ macs: [AgentWidgetMac]) -> [AgentWidgetItem] {
        macs.flatMap { mac in mac.rows.map { AgentWidgetItem(macId: mac.id, row: $0) } }
            .sorted { a, b in
                if a.row.state.rank != b.row.state.rank { return a.row.state.rank < b.row.state.rank }
                let sinceA = a.row.since ?? Int.max
                let sinceB = b.row.since ?? Int.max
                if sinceA != sinceB { return sinceA < sinceB }
                return (a.macId, a.row.project, a.row.key) < (b.macId, b.row.project, b.row.key)
            }
    }

    /// Replace one Mac's agents with what the live link shows.
    static func publish(_ mac: AgentWidgetMac) {
        save(mac, confirming: false)
    }

    /// Publish, stamped as seen now even when nothing changed: the app is leaving a
    /// live Mac, so a quiet list it last showed still reads as current.
    static func confirm(_ mac: AgentWidgetMac) {
        save(mac, confirming: true)
    }

    private static func save(_ mac: AgentWidgetMac, confirming: Bool) {
        update { macs in
            var seen = mac
            seen.seenAt = nowMillis()
            guard let index = macs.firstIndex(where: { $0.id == mac.id }) else {
                macs.append(seen)
                return true
            }
            guard confirming || macs[index].rows != mac.rows || macs[index].name != mac.name else {
                return false
            }
            macs[index] = seen
            return true
        }
    }

    /// Forget Macs the phone no longer has.
    static func remove(_ ids: Set<String>) {
        update { macs in
            let before = macs.count
            macs.removeAll { ids.contains($0.id) }
            return macs.count != before
        }
    }

    /// An agent status push: its tab now waits on you, hit a problem, or finished.
    static func apply(push payload: [String: Any]) {
        guard (payload["target"] as? String ?? "terminal") == "terminal",
              let macId = payload["serverId"] as? String, !macId.isEmpty,
              let project = payload["project"] as? String, !project.isEmpty,
              let key = payload["key"] as? String, !key.isEmpty,
              let status = payload["status"] as? String
        else { return }
        let state = AgentState.of(status)
        guard state != .idle && state != .working else { return }
        let stamp = (payload["ts"] as? NSNumber)?.intValue
        let terminalId = (payload["terminalId"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        let tab = payload["terminal"] as? String ?? ""
        update { macs in
            var mac = macs.first { $0.id == macId } ?? AgentWidgetMac(id: macId, rows: [])
            let existing = mac.rows.firstIndex { $0.project == project && $0.key == key }
            let previous = existing.map { mac.rows[$0] }
            var row = previous ?? AgentWidgetRow(project: project, key: key, terminalId: terminalId,
                                                 title: agentProviderLabel(forStatusKey: key),
                                                 state: state)
            if !tab.isEmpty { row.title = tab }
            if let terminalId { row.terminalId = terminalId }
            row.state = state
            // A finished turn reads as how long the work took, from when the agent
            // picked it up; a wait or a problem as how long it has been true.
            if state == .done {
                row.since = previous?.state == .working ? previous?.since : nil
                row.until = stamp
            } else {
                row.since = stamp
                row.until = nil
            }
            if let existing { mac.rows[existing] = row } else { mac.rows.append(row) }
            mac.seenAt = nowMillis()
            macs.removeAll { $0.id == macId }
            macs.append(mac)
            return true
        }
    }

    /// A silent push withdrawing statuses the Mac cleared: their rows go too.
    static func apply(clear entries: [[String: Any]], serverId: String?) {
        let gone = Set(entries.compactMap { entry -> String? in
            guard let project = entry["project"] as? String, let key = entry["key"] as? String else {
                return nil
            }
            return PushPayload.statusIdentity(project: project, statusKey: key)
        })
        guard !gone.isEmpty else { return }
        update { macs in
            var changed = false
            for m in macs.indices where PushPayload.serverIdsMatch(macs[m].id, serverId) {
                let before = macs[m].rows.count
                macs[m].rows.removeAll {
                    gone.contains(PushPayload.statusIdentity(project: $0.project, statusKey: $0.key))
                }
                guard macs[m].rows.count != before else { continue }
                macs[m].seenAt = nowMillis()
                changed = true
            }
            return changed
        }
    }

    /// Read, change and write back under a file lock, so the app and the
    /// notification extension never overwrite each other's change.
    private static func update(_ change: (inout [AgentWidgetMac]) -> Bool) {
        guard let url else { return }
        var changed = false
        var failure: NSError?
        NSFileCoordinator().coordinate(writingItemAt: url, options: .forMerging, error: &failure) { url in
            var macs = (try? Data(contentsOf: url)).flatMap {
                try? JSONDecoder().decode([AgentWidgetMac].self, from: $0)
            } ?? []
            guard change(&macs), let data = try? JSONEncoder().encode(macs) else { return }
            changed = (try? data.write(to: url, options: .atomic)) != nil
        }
        if changed { WidgetCenter.shared.reloadTimelines(ofKind: kind) }
    }

    private static func nowMillis() -> Int {
        Int(Date().timeIntervalSince1970 * 1000)
    }
}

/// The link a widget row opens: that agent's terminal, on its Mac.
enum AgentWidgetLink {
    static let scheme = "lpmlink"

    static func url(macId: String, project: String, terminalId: String?) -> URL? {
        var parts = URLComponents()
        parts.scheme = scheme
        parts.host = "agent"
        parts.queryItems = [URLQueryItem(name: "mac", value: macId),
                            URLQueryItem(name: "project", value: project)]
            + (terminalId.map { [URLQueryItem(name: "terminal", value: $0)] } ?? [])
        return parts.url
    }

    static func parse(_ url: URL) -> (macId: String, project: String, terminalId: String?)? {
        guard url.scheme == scheme, url.host == "agent",
              let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems
        else { return nil }
        let value = { (name: String) in items.first { $0.name == name }?.value.flatMap { $0.isEmpty ? nil : $0 } }
        guard let macId = value("mac"), let project = value("project") else { return nil }
        return (macId, project, value("terminal"))
    }
}

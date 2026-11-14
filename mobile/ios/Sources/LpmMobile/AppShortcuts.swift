import SwiftUI
import UIKit

/// The app icon's long-press menu: the live Mac's three agent tabs that most
/// want a look (waiting first, then the most recently busy), and New Tab in the
/// project last opened. Rewritten whenever the app leaves the screen.
enum AppShortcuts {
    static let terminalType = "cx.lpm.mobile.terminal"
    static let newTabType = "cx.lpm.mobile.newTab"
    private static let tabLimit = 3

    static func items(rows: [AgentWidgetRow], serverId: String?, newTabIn project: Project?,
                      label: (String) -> String) -> [UIApplicationShortcutItem] {
        var seen = Set<String>()
        let tabs = rows
            .filter { $0.terminalId != nil }
            .sorted { a, b in
                a.state.rank == b.state.rank ? (a.since ?? 0) > (b.since ?? 0) : a.state.rank < b.state.rank
            }
            .filter { seen.insert($0.project + "\n" + ($0.terminalId ?? "")).inserted }
            .prefix(tabLimit)
            .map { row in
                UIApplicationShortcutItem(
                    type: terminalType,
                    localizedTitle: row.title,
                    localizedSubtitle: "\(label(row.project)) · \(row.state.label)",
                    icon: UIApplicationShortcutIcon(systemImageName: symbol(row.state)),
                    userInfo: info(serverId: serverId, project: row.project, terminal: row.terminalId))
            }
        guard let project else { return Array(tabs) }
        let newTab = UIApplicationShortcutItem(
            type: newTabType,
            localizedTitle: "New Tab",
            localizedSubtitle: "in \(label(project.name))",
            icon: UIApplicationShortcutIcon(systemImageName: "plus"),
            userInfo: info(serverId: serverId, project: project.name, terminal: nil))
        return Array(tabs) + [newTab]
    }

    /// Where a picked item goes.
    static func target(_ item: UIApplicationShortcutItem) -> NotificationOpenTarget? {
        guard let project = item.userInfo?["project"] as? String, !project.isEmpty else { return nil }
        let serverId = (item.userInfo?["serverId"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        switch item.type {
        case terminalType:
            return NotificationOpenTarget(serverId: serverId, project: project,
                                          terminal: item.userInfo?["terminal"] as? String)
        case newTabType:
            return NotificationOpenTarget(serverId: serverId, newTabIn: project)
        default:
            return nil
        }
    }

    private static func symbol(_ state: AgentState) -> String {
        switch state {
        case .needsYou: return "bell.fill"
        case .error: return "exclamationmark.circle.fill"
        case .done: return "checkmark"
        case .working, .idle: return "terminal"
        }
    }

    private static func info(serverId: String?, project: String, terminal: String?) -> [String: NSSecureCoding] {
        var info: [String: NSSecureCoding] = ["project": project as NSString]
        if let serverId { info["serverId"] = serverId as NSString }
        if let terminal { info["terminal"] = terminal as NSString }
        return info
    }
}

/// Writes the icon's menu as the app leaves the screen, from the same live tab
/// list the Agents widget shows. Demo Mode's projects aren't real, so it leaves
/// the menu empty.
struct AppShortcutPublisher: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Color.clear
            .onChange(of: scenePhase) { _, phase in
                guard phase != .active else { return }
                publish()
            }
    }

    private func publish() {
        guard !model.demoMode else {
            UIApplication.shared.shortcutItems = []
            return
        }
        guard let mac = model.agentWidgetMac else { return }
        let project = model.lastOpenedProject.flatMap { name in model.projects.first { $0.name == name } }
        let labels = Dictionary(model.projects.map { ($0.name, $0.label) }, uniquingKeysWith: { a, _ in a })
        UIApplication.shared.shortcutItems = AppShortcuts.items(
            rows: mac.rows, serverId: model.activeRecord?.serverId,
            newTabIn: model.canLaunchAgents ? project : nil,
            label: { name in labels[name].flatMap { $0.isEmpty ? nil : $0 } ?? name })
    }
}

/// Hands the scene's quick-action picks to the app. A pick that launched the app
/// arrives with the scene's connection instead (AppDelegate).
final class ShortcutSceneDelegate: NSObject, UIWindowSceneDelegate {
    func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem,
                     completionHandler: @escaping (Bool) -> Void) {
        completionHandler(AppDelegate.shared?.open(shortcutItem) ?? false)
    }
}

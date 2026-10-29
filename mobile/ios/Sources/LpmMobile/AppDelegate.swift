import UIKit
import UserNotifications

enum NotificationTargetKind: String {
    case project
    case terminal
    case automation
    case recap
    case changes
    case usage
}

struct NotificationOpenTarget: Equatable {
    let serverId: String?
    let project: String
    let kind: NotificationTargetKind
    let itemId: String?

    init?(userInfo: [AnyHashable: Any]) {
        let serverId = (userInfo["serverId"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        let target = NotificationTargetKind(rawValue: userInfo["target"] as? String ?? "") ?? .project
        // The weekly recap and Usage belong to the Mac, not to one of its projects.
        if target == .recap || target == .usage {
            self.serverId = serverId
            self.project = ""
            self.kind = target
            self.itemId = target == .recap ? (userInfo["week"] as? String).flatMap { $0.isEmpty ? nil : $0 } : nil
            return
        }
        guard let project = userInfo["project"] as? String, !project.isEmpty else { return nil }
        let itemId: String?
        switch target {
        case .terminal:
            itemId = (userInfo["terminalId"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        case .automation:
            itemId = (userInfo["automationId"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        case .project, .recap, .changes, .usage:
            itemId = nil
        }
        self.serverId = serverId
        self.project = project
        self.kind = itemId == nil ? .project : target
        self.itemId = itemId
    }

    /// The review screen of the project a notification is about.
    init?(changesFor userInfo: [AnyHashable: Any]) {
        guard let project = userInfo["project"] as? String, !project.isEmpty else { return nil }
        self.serverId = (userInfo["serverId"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        self.project = project
        self.kind = .changes
        self.itemId = nil
    }

    init(serverId: String?, project: String, terminal: String?) {
        self.serverId = serverId
        self.project = project
        self.kind = terminal == nil ? .project : .terminal
        self.itemId = terminal
    }
}

/// Bridges UIKit's remote-notification callbacks into the SwiftUI app: forwards the
/// APNs device token to the model, suppresses banners the live socket already shows
/// while foregrounded, and routes a notification tap to its destination.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    weak var model: AppModel?
    // The device token and a cold-launch notification tap can both arrive before
    // the model is attached; hold them and hand them over on attach.
    private var pendingToken: String?
    private var pendingTarget: NotificationOpenTarget?
    private let answers = MainActor.assumeIsolated { AgentAnswerSender() }

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        MainActor.assumeIsolated { AgentAnswerSender.registerCategories() }
        return true
    }

    func attach(_ model: AppModel) {
        self.model = model
        if let token = pendingToken { model.setApnsDeviceToken(token) }
        if let target = pendingTarget {
            model.pendingNotificationTarget = target
            pendingTarget = nil
        }
    }

    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        pendingToken = hex
        MainActor.assumeIsolated { model?.setApnsDeviceToken(hex) }
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("apns: registration failed: \(error.localizedDescription)")
    }

    /// Silent background push that withdraws delivered notifications: decrypts the
    /// blob and, if it carries a `clear` array, removes every delivered notification
    /// whose (project, statusKey) matches an entry. Fails safe to `.noData` on any
    /// garbage — this fires only for content-available pushes, so alert pushes
    /// (mutable-content only) never reach here.
    func application(_ application: UIApplication,
                     didReceiveRemoteNotification userInfo: [AnyHashable: Any],
                     fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        guard let blob = userInfo["blob"] as? String,
              let payload = PushPayload.open(blob: blob),
              let clears = payload["clear"] as? [[String: Any]]
        else { completionHandler(.noData); return }

        let targets = Set(clears.compactMap { entry -> String? in
            guard let project = entry["project"] as? String,
                  let key = entry["key"] as? String else { return nil }
            return PushPayload.statusIdentity(project: project, statusKey: key)
        })
        guard !targets.isEmpty else { completionHandler(.noData); return }

        // The Mac this clear came from (absent on old Macs), so a clear only
        // withdraws notifications posted by the same Mac.
        let incomingServerId = payload["serverId"] as? String
        AgentWidgetStore.apply(clear: clears, serverId: incomingServerId)
        let center = UNUserNotificationCenter.current()
        center.getDeliveredNotifications { delivered in
            let ids = delivered.compactMap { note -> String? in
                let info = note.request.content.userInfo
                guard let project = info["project"] as? String,
                      let key = info["statusKey"] as? String,
                      targets.contains(PushPayload.statusIdentity(project: project, statusKey: key)),
                      PushPayload.serverIdsMatch(info["serverId"] as? String, incomingServerId)
                else { return nil }
                return note.request.identifier
            }
            if !ids.isEmpty { center.removeDeliveredNotifications(withIdentifiers: ids) }
            completionHandler(ids.isEmpty ? .noData : .newData)
        }
    }

    /// The open app shows its live Mac's statuses itself. A push only comes when
    /// the Mac has no socket to this phone: another saved Mac, or the live one
    /// while the link is down. That news is shown like it would be in the
    /// background, or nothing on the phone would show it at all.
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        let serverId = notification.request.content.userInfo["serverId"] as? String
        let shown = MainActor.assumeIsolated {
            model?.showsLive(serverId: serverId) ?? false
        }
        completionHandler(shown ? [] : [.banner, .list, .sound])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        // A button answered the agent: send it and stay in the background.
        if AgentAnswerAction(identifier: response.actionIdentifier) != nil {
            guard let answer = AgentAnswer(response: response) else {
                completionHandler()
                return
            }
            MainActor.assumeIsolated {
                let live = model.map { model in { (answer: AgentAnswer) in await model.answerLive(answer) } }
                Task { @MainActor in
                    await answers.send(answer, live: live, notification: response.notification)
                    completionHandler()
                }
            }
            return
        }
        let userInfo = response.notification.request.content.userInfo
        let opening = response.actionIdentifier == AgentAnswerSender.reviewChangesAction
            ? NotificationOpenTarget(changesFor: userInfo)
            : NotificationOpenTarget(userInfo: userInfo)
        if let target = opening {
            if model != nil {
                MainActor.assumeIsolated { model?.pendingNotificationTarget = target }
            } else {
                pendingTarget = target
            }
        }
        completionHandler()
    }
}

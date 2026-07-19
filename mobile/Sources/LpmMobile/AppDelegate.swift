import UIKit
import UserNotifications

enum NotificationTargetKind: String {
    case project
    case terminal
    case automation
}

struct NotificationOpenTarget: Equatable {
    let serverId: String?
    let project: String
    let kind: NotificationTargetKind
    let itemId: String?

    init?(userInfo: [AnyHashable: Any]) {
        guard let project = userInfo["project"] as? String, !project.isEmpty else { return nil }
        let serverId = (userInfo["serverId"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        let target = NotificationTargetKind(rawValue: userInfo["target"] as? String ?? "") ?? .project
        let itemId: String?
        switch target {
        case .terminal:
            itemId = (userInfo["terminalId"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        case .automation:
            itemId = (userInfo["automationId"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        case .project:
            itemId = nil
        }
        self.serverId = serverId
        self.project = project
        self.kind = itemId == nil ? .project : target
        self.itemId = itemId
    }
}

/// Bridges UIKit's remote-notification callbacks into the SwiftUI app: forwards the
/// APNs device token to the model, suppresses banners while foregrounded (the live
/// socket already shows status), and routes a notification tap to its destination.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    weak var model: AppModel?
    // The device token and a cold-launch notification tap can both arrive before
    // the model is attached; hold them and hand them over on attach.
    private var pendingToken: String?
    private var pendingTarget: NotificationOpenTarget?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
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

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        if let target = NotificationOpenTarget(userInfo: response.notification.request.content.userInfo) {
            if model != nil {
                MainActor.assumeIsolated { model?.pendingNotificationTarget = target }
            } else {
                pendingTarget = target
            }
        }
        completionHandler()
    }
}

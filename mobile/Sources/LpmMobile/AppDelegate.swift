import UIKit
import UserNotifications

/// Bridges UIKit's remote-notification callbacks into the SwiftUI app: forwards the
/// APNs device token to the model, suppresses banners while foregrounded (the live
/// socket already shows status), and routes a notification tap to the project it
/// names.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    weak var model: AppModel?
    // The device token and a cold-launch notification tap can both arrive before
    // the model is attached; hold them and hand them over on attach.
    private var pendingToken: String?
    private var pendingProject: String?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func attach(_ model: AppModel) {
        self.model = model
        if let token = pendingToken { model.setApnsDeviceToken(token) }
        if let project = pendingProject {
            model.pendingOpenProject = project
            pendingProject = nil
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

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        if let project = response.notification.request.content.userInfo["project"] as? String, !project.isEmpty {
            if model != nil {
                MainActor.assumeIsolated { model?.pendingOpenProject = project }
            } else {
                pendingProject = project
            }
        }
        completionHandler()
    }
}

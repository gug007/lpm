import UIKit
import UserNotifications

/// Sends a notification button's answer to its Mac: over the live session when
/// that is with the same Mac, else on an errand connection of its own — the tap
/// may have woken the app in the background with no session at all. Only a
/// failure is shown: the notification is replaced by one saying what went wrong,
/// which still opens the tab.
@MainActor
final class AgentAnswerSender {
    enum Outcome: Equatable {
        case sent
        case failed(String)
    }

    private static let errandTimeout: TimeInterval = 25

    /// A finished turn's other two buttons, which open the app rather than answer.
    static let reviewChangesAction = "lpm.open.changes"
    static let openTabAction = "lpm.open.tab"

    /// The buttons each answering category shows. Every one needs the phone
    /// unlocked: they act on the Mac.
    static func registerCategories() {
        let allow = UNNotificationAction(identifier: AgentAnswerAction.allow.identifier, title: "Allow",
                                         options: [.authenticationRequired],
                                         icon: UNNotificationActionIcon(systemImageName: "checkmark"))
        let deny = UNNotificationAction(identifier: AgentAnswerAction.deny.identifier, title: "Deny",
                                        options: [.authenticationRequired, .destructive],
                                        icon: UNNotificationActionIcon(systemImageName: "xmark"))
        let reply = UNTextInputNotificationAction(identifier: AgentAnswerAction.reply.identifier,
                                                  title: "Reply", options: [.authenticationRequired],
                                                  icon: UNNotificationActionIcon(systemImageName: "arrowshape.turn.up.left"),
                                                  textInputButtonTitle: "Send", textInputPlaceholder: "Reply…")
        let review = UNNotificationAction(identifier: reviewChangesAction, title: "Review Changes",
                                          options: [.foreground],
                                          icon: UNNotificationActionIcon(systemImageName: "checklist"))
        let openTab = UNNotificationAction(identifier: openTabAction, title: "Open Tab",
                                           options: [.foreground],
                                           icon: UNNotificationActionIcon(systemImageName: "terminal"))
        UNUserNotificationCenter.current().setNotificationCategories([
            UNNotificationCategory(identifier: AgentAnswerAction.permissionCategory,
                                   actions: [allow, deny], intentIdentifiers: []),
            UNNotificationCategory(identifier: AgentAnswerAction.replyCategory,
                                   actions: [reply, review, openTab], intentIdentifiers: []),
        ])
    }

    func send(_ answer: AgentAnswer, live: ((AgentAnswer) async -> Outcome?)?,
              notification: UNNotification) async {
        let background = UIApplication.shared.beginBackgroundTask(withName: "lpm.answer")
        defer {
            if background != .invalid { UIApplication.shared.endBackgroundTask(background) }
        }
        let outcome: Outcome
        if let live, let sent = await live(answer) {
            outcome = sent
        } else {
            outcome = await viaErrand(answer)
        }
        let center = UNUserNotificationCenter.current()
        switch outcome {
        case .sent:
            center.removeDeliveredNotifications(withIdentifiers: [notification.request.identifier])
        case .failed(let reason):
            try? await center.add(failureNotice(reason, for: answer, replacing: notification))
        }
    }

    private func viaErrand(_ answer: AgentAnswer) async -> Outcome {
        guard let mac = MacErrand.mac(serverId: answer.serverId) else {
            return .failed("This Mac isn't on this phone any more.")
        }
        let reqId = UUID().uuidString
        var error: String?
        let answered = await MacErrand.run(to: mac, deviceName: UIDevice.current.name,
                                           timeout: Self.errandTimeout) { client, done in
            client.onAnswerAgent = { id, reason in
                guard id == reqId else { return }
                error = reason
                done(true)
            }
            client.answerAgent(answer, reqId: reqId)
        }
        guard answered else { return .failed("Couldn't reach \(mac.displayName).") }
        return error.map(Outcome.failed) ?? .sent
    }

    private func failureNotice(_ reason: String, for answer: AgentAnswer,
                               replacing notification: UNNotification) -> UNNotificationRequest {
        let original = notification.request.content
        let content = UNMutableNotificationContent()
        content.title = answer.title
        content.body = "Not sent: \(reason)"
        content.sound = .default
        content.threadIdentifier = original.threadIdentifier
        // The tap still goes to the tab; no buttons, since the answer didn't take.
        content.userInfo = original.userInfo
        return UNNotificationRequest(identifier: notification.request.identifier, content: content, trigger: nil)
    }
}

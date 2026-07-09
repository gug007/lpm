import UserNotifications
import CryptoKit

/// Decrypts an lpm push payload and rewrites the notification with the real
/// project / terminal / status. The payload is sealed with the phone's shared push
/// key (AES-256-GCM, `nonce || ciphertext || tag` base64). On any failure we
/// deliver the untouched generic content, so a notification still shows and nothing
/// sensitive leaks.
final class NotificationService: UNNotificationServiceExtension {
    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var fallback: UNNotificationContent?

    override func didReceive(_ request: UNNotificationRequest,
                             withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        self.contentHandler = contentHandler
        self.fallback = request.content
        contentHandler(rewritten(request.content) ?? request.content)
    }

    override func serviceExtensionTimeWillExpire() {
        if let contentHandler, let fallback { contentHandler(fallback) }
    }

    private func rewritten(_ original: UNNotificationContent) -> UNNotificationContent? {
        guard let blob = original.userInfo["blob"] as? String,
              let sealed = Data(base64Encoded: blob),
              let keyData = PushKey.load(),
              let box = try? AES.GCM.SealedBox(combined: sealed),
              let plaintext = try? AES.GCM.open(box, using: SymmetricKey(data: keyData)),
              let payload = try? JSONSerialization.jsonObject(with: plaintext) as? [String: Any],
              let project = payload["project"] as? String, !project.isEmpty,
              let mutable = original.mutableCopy() as? UNMutableNotificationContent
        else { return nil }

        let terminal = payload["terminal"] as? String ?? ""
        let status = payload["status"] as? String ?? ""

        mutable.title = project
        mutable.body = body(terminal: terminal, status: status)
        // Group notifications per project in Notification Center.
        mutable.threadIdentifier = project
        var info = mutable.userInfo
        info["project"] = project
        mutable.userInfo = info
        return mutable
    }

    private func body(terminal: String, status: String) -> String {
        let phrase: String
        switch status {
        case "Waiting": phrase = "Agent is waiting for you"
        case "Done": phrase = "Agent finished"
        case "Error": phrase = "Agent hit an error"
        default: phrase = status
        }
        return terminal.isEmpty ? phrase : "\(terminal) — \(phrase)"
    }
}

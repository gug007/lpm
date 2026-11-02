import SwiftUI
import UIKit
import UserNotifications
import UserNotificationsUI

/// A finished turn's notification, pressed open: the agent's whole answer as
/// Markdown and the files the turn changed, above the alert's own buttons.
final class NotificationViewController: UIViewController, UNNotificationContentExtension {
    private var host: UIHostingController<AgentAnswerCard>?

    func didReceive(_ notification: UNNotification) {
        let card = AgentAnswerCard(notification.request.content)
        if let host {
            host.rootView = card
        } else {
            embed(UIHostingController(rootView: card))
        }
        fitHeight()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        fitHeight()
    }

    private func embed(_ host: UIHostingController<AgentAnswerCard>) {
        host.view.backgroundColor = .clear
        host.view.translatesAutoresizingMaskIntoConstraints = false
        addChild(host)
        view.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        host.didMove(toParent: self)
        self.host = host
    }

    /// The system sizes this view from `preferredContentSize`, and how tall the
    /// card is depends on the width it gets.
    private func fitHeight() {
        let width = view.bounds.width
        guard let host, width > 0 else { return }
        let height = host.sizeThatFits(in: CGSize(width: width, height: .greatestFiniteMagnitude)).height
        guard abs(preferredContentSize.height - height) > 0.5 else { return }
        preferredContentSize = CGSize(width: width, height: height)
    }
}

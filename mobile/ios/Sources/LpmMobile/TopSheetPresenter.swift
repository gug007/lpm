import SwiftUI
import UIKit

extension UIApplication {
    /// The key window's root view controller.
    static var keyRootViewController: UIViewController? {
        shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow }?
            .rootViewController
    }

    /// The controller on top of everything presented: where a new sheet goes.
    static var topViewController: UIViewController? {
        var top = keyRootViewController
        while let next = top?.presentedViewController, !next.isBeingDismissed {
            top = next
        }
        return top
    }
}

/// Presents a SwiftUI view as a sheet over whatever is on screen, another sheet
/// included, which a SwiftUI `.sheet` can't do: it opens no second sheet while one
/// is up. `onSwipe` runs when the person swipes it away, not when it's dismissed
/// from code.
@MainActor
final class TopSheetPresenter: NSObject, UIAdaptivePresentationControllerDelegate {
    private weak var controller: UIViewController?
    private var onSwipe: (() -> Void)?

    func present(_ view: some View, onSwipe: @escaping () -> Void) {
        dismiss()
        guard let top = UIApplication.topViewController else { return }
        let host = UIHostingController(rootView: view)
        if let sheet = host.sheetPresentationController {
            sheet.detents = [.medium(), .large()]
            sheet.prefersGrabberVisible = true
        }
        host.presentationController?.delegate = self
        top.present(host, animated: true)
        controller = host
        self.onSwipe = onSwipe
    }

    func dismiss() {
        controller?.presentingViewController?.dismiss(animated: true)
        controller = nil
        onSwipe = nil
    }

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        let swiped = onSwipe
        controller = nil
        onSwipe = nil
        swiped?()
    }
}

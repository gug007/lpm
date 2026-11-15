import UIKit

/// `lpm://pair?…`, the pairing QR read by the Camera app instead of lpm Link's
/// scanner. A link can come from anywhere, so it only opens the pairing screen
/// with the code waiting: the pairing screen asks before it pairs.
extension AppModel {
    func openPairingLink(_ url: URL) {
        guard let payload = PairPayload(url.absoluteString) else { return }
        if demoMode { exitDemo() }
        pairLink = payload
        presentPairLink()
    }

    /// With a Mac saved, the code waits on "Add a machine" (or the re-pair already
    /// open); with none, the pairing screen is the root and has it already. A sheet
    /// left open in the app would keep "Add a machine" from showing, so it goes first.
    func presentPairLink() {
        guard pairLink != nil, !macs.isEmpty, !addingMac else { return }
        guard let root = Self.rootViewController, root.presentedViewController != nil else {
            beginAddMac()
            return
        }
        root.dismiss(animated: true) { [weak self] in self?.beginAddMac() }
    }

    /// Hands the waiting code to the pairing screen that will ask about it.
    func takePairLink() -> PairPayload? {
        defer { pairLink = nil }
        return pairLink
    }

    private static var rootViewController: UIViewController? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow }?
            .rootViewController
    }
}

import SafariServices
import SwiftUI

/// A web page in an in-app Safari sheet — for sign-in pages that must run in a
/// real browser (Google and others refuse embedded web views).
struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let controller = SFSafariViewController(url: url)
        controller.dismissButtonStyle = .close
        return controller
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}

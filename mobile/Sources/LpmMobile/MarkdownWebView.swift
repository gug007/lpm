import SwiftUI
import WebKit

/// A Markdown file rendered like the desktop's Files preview: GitHub-flavoured
/// Markdown with its inline HTML, sanitized, in a web view (web/markdown/). Images
/// beside the file come from the Mac; a link to another file opens it, and any
/// other link opens outside the app.
struct MarkdownWebView: UIViewRepresentable {
    @Environment(AppModel.self) private var model
    let text: String
    let project: String
    /// The Markdown file's own path on the Mac, which relative links resolve against.
    let path: String
    var onOpenFile: ([String]) -> Void

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let coordinator = context.coordinator
        let controller = WKUserContentController()
        controller.add(coordinator, name: "link")
        controller.add(coordinator, name: "copy")

        let config = WKWebViewConfiguration()
        config.userContentController = controller
        config.setURLSchemeHandler(coordinator.images, forURLScheme: MarkdownImageLoader.scheme)

        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = .clear
        web.scrollView.backgroundColor = .clear
        web.navigationDelegate = coordinator
        coordinator.web = web
        update(coordinator)

        let dir = TerminalWebPool.webDir
        web.loadFileURL(dir.appendingPathComponent("markdown/markdown.html"), allowingReadAccessTo: dir)
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {
        update(context.coordinator)
    }

    static func dismantleUIView(_ web: WKWebView, coordinator: Coordinator) {
        let controller = web.configuration.userContentController
        ["link", "copy"].forEach { controller.removeScriptMessageHandler(forName: $0) }
        coordinator.images.cancelAll()
    }

    private func update(_ coordinator: Coordinator) {
        coordinator.images.model = model
        coordinator.images.project = project
        coordinator.images.path = path
        coordinator.onOpenFile = onOpenFile
        coordinator.show(text)
    }

    @MainActor
    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        let images = MarkdownImageLoader()
        weak var web: WKWebView?
        var onOpenFile: (([String]) -> Void)?
        private var text: String?
        private var rendered: String?
        private var loaded = false

        func show(_ text: String) {
            self.text = text
            render()
        }

        private func render() {
            guard loaded, let web, let text, text != rendered else { return }
            rendered = text
            web.callAsyncJavaScript("renderMarkdown(text)", arguments: ["text": text],
                                    in: nil, in: .page, completionHandler: nil)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            loaded = true
            render()
        }

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            decisionHandler(action.request.url?.isFileURL == true ? .allow : .cancel)
        }

        /// The page can die in the background; bring it back with the same text.
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            loaded = false
            rendered = nil
            webView.reload()
        }

        func userContentController(_ controller: WKUserContentController,
                                   didReceive message: WKScriptMessage) {
            guard let body = message.body as? String else { return }
            switch message.name {
            case "link":
                switch MarkdownLink.resolve(body, from: images.path) {
                case .external(let url): UIApplication.shared.open(url)
                case .file(let paths): onOpenFile?(paths)
                case .anchor: break
                }
            case "copy":
                UIPasteboard.general.string = body
                Haptics.tap()
            default:
                break
            }
        }
    }
}

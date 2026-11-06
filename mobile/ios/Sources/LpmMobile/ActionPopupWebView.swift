import SwiftUI
import WebKit

/// An action popup's page (PROTOCOL.md, Action popups): the Mac's HTML loaded with
/// no base URL, `bootstrap.js` run before its own scripts, and nothing more. The
/// page gets no bridge to the app and can't navigate away: a tapped web link opens
/// outside the app, anything else is dropped. A refresh hands its new values to
/// `window.__lpmPush` without reloading the page.
struct ActionPopupWebView: UIViewRepresentable {
    let html: String
    /// What `window.lpm` starts with, as JSON. Built only for a load.
    let payload: () -> String
    /// The values the last refresh brought, as JSON. Built only for a push.
    let push: () -> String
    let page: Int
    let pushes: Int
    let onFailure: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.mediaTypesRequiringUserActionForPlayback = .all
        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = .clear
        web.scrollView.backgroundColor = .clear
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.allowsLinkPreview = false
        web.navigationDelegate = context.coordinator
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {
        let coordinator = context.coordinator
        coordinator.onFailure = onFailure
        if coordinator.page != page {
            coordinator.page = page
            coordinator.pushes = pushes
            coordinator.load(html, payload: payload(), in: web)
        } else if coordinator.pushes != pushes {
            coordinator.pushes = pushes
            web.evaluateJavaScript("window.__lpmPush && window.__lpmPush(\(push()));", completionHandler: nil)
        }
    }

    static func dismantleUIView(_ web: WKWebView, coordinator: Coordinator) {
        web.stopLoading()
        web.navigationDelegate = nil
        web.configuration.userContentController.removeAllUserScripts()
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate {
        var page = -1
        var pushes = 0
        var onFailure: (() -> Void)?
        /// The next main-frame navigation is the page's own load.
        private var loading = false

        func load(_ html: String, payload: String, in web: WKWebView) {
            let scripts = web.configuration.userContentController
            scripts.removeAllUserScripts()
            if let bootstrap = ActionPopupPage.bootstrap(payload) {
                scripts.addUserScript(WKUserScript(source: bootstrap, injectionTime: .atDocumentStart,
                                                   forMainFrameOnly: true))
            }
            scripts.addUserScript(WKUserScript(source: ActionPopupPage.viewport, injectionTime: .atDocumentEnd,
                                               forMainFrameOnly: true))
            loading = true
            web.loadHTMLString(html, baseURL: nil)
        }

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            decisionHandler(policy(for: action))
        }

        private func policy(for action: WKNavigationAction) -> WKNavigationActionPolicy {
            let url = action.request.url
            let scheme = url?.scheme?.lowercased() ?? ""
            let isWeb = scheme == "http" || scheme == "https"
            if url?.fragment != nil, url?.absoluteString.hasPrefix("about:blank#") == true {
                return .allow
            }
            if action.navigationType == .linkActivated {
                if isWeb, let url { UIApplication.shared.open(url) }
                return .cancel
            }
            guard let frame = action.targetFrame else { return .cancel }
            if frame.isMainFrame {
                guard loading else { return .cancel }
                loading = false
                return .allow
            }
            return isWeb || ["about", "data", "blob"].contains(scheme) ? .allow : .cancel
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            onFailure?()
        }
    }
}

/// The scripts a popup page gets from the app.
enum ActionPopupPage {
    private static let token = "__LPM_POPUP_PAYLOAD__"

    private static let template: String? = try? String(
        contentsOf: TerminalWebPool.webDir.appendingPathComponent("popup/bootstrap.js"), encoding: .utf8)

    /// `bootstrap.js` with its payload in place of the token it's called with.
    static func bootstrap(_ payload: String) -> String? {
        guard let template, let range = template.range(of: token, options: .backwards) else { return nil }
        return template.replacingCharacters(in: range, with: payload)
    }

    /// A page with no viewport of its own is laid out at the sheet's width, as on
    /// the desktop, rather than as a 980-point desktop page.
    static let viewport = """
    (function () {
      if (document.querySelector('meta[name="viewport"]') || !document.head) return;
      var meta = document.createElement('meta');
      meta.name = 'viewport';
      meta.content = 'width=device-width, initial-scale=1';
      document.head.appendChild(meta);
    })();
    """
}

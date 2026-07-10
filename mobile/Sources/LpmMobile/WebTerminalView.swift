import SwiftUI
import UIKit
import WebKit

/// Pre-warms WebKit for the terminal web views. Creating the first WKWebView
/// cold-starts WebKit's helper processes (GPU/WebContent/Networking) — the device
/// logs show that taking ~2s. iOS 15+ shares one WebContent process across all
/// WKWebViews automatically, so spinning up one throwaway view at launch (which
/// also parses xterm.js) means the first terminal the user opens reuses the warm
/// process instead of paying that cost.
enum TerminalWebPool {
    private static var warmup: WKWebView?

    /// The bundled xterm page + assets (preserved "web/" folder).
    static var webDir: URL {
        (Bundle.main.resourceURL ?? Bundle.main.bundleURL)
            .appendingPathComponent("web", isDirectory: true)
    }

    /// Create one throwaway web view at launch so WebKit's processes are live and
    /// xterm.js is parsed before the first real terminal opens. Idempotent.
    static func prewarm() {
        guard warmup == nil else { return }
        let web = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        web.loadFileURL(webDir.appendingPathComponent("terminal.html"),
                        allowingReadAccessTo: webDir)
        warmup = web
    }
}

/// The terminal, rendered by xterm.js inside a WKWebView — the same emulator the
/// desktop uses, so rendering matches and (unlike SwiftTerm's iOS view) scrollback
/// works: xterm owns a real scrolling viewport with 10k lines of history.
///
/// Wiring mirrors the old SwiftTerm representable: server output is fed in, xterm
/// posts keystrokes and its fitted geometry back out. Output crosses the JS bridge
/// as base64(UTF-8) to avoid string-escaping hazards in evaluateJavaScript.
struct WebTerminalView: UIViewRepresentable {
    @EnvironmentObject var model: AppModel
    let term: TerminalInfo
    /// Fired once, when the first screen content renders — lets the host screen
    /// drop its loading spinner.
    var onFirstContent: (() -> Void)? = nil
    /// Top safe-area inset so xterm's content clears the translucent nav bar.
    var topInset: CGFloat = 0

    func makeCoordinator() -> Coordinator { Coordinator(model: model, termId: term.id) }

    func makeUIView(context: Context) -> WKWebView {
        let controller = WKUserContentController()
        controller.add(context.coordinator, name: "input")
        controller.add(context.coordinator, name: "resize")
        controller.add(context.coordinator, name: "ready")

        let config = WKWebViewConfiguration()
        config.userContentController = controller
        config.allowsInlineMediaPlayback = true

        // True-black ground so there's no color mismatch behind the page while it
        // loads (matches terminal.html's #000000 for a clean OLED look).
        let ground = UIColor.black
        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = ground
        web.scrollView.backgroundColor = ground
        web.scrollView.contentInsetAdjustmentBehavior = .never
        // xterm owns scrolling inside the page; the webview itself must not bounce.
        web.scrollView.isScrollEnabled = false
        context.coordinator.web = web

        // Assets ship as a preserved "web/" folder; grant read access to the whole
        // folder so xterm's relative script/css loads resolve.
        let dir = TerminalWebPool.webDir
        web.loadFileURL(dir.appendingPathComponent("terminal.html"), allowingReadAccessTo: dir)

        context.coordinator.topInset = topInset
        context.coordinator.onFirstContent = onFirstContent
        // Capture only the coordinator, not `context` — these closures outlive this
        // call (held by the subscription until unsubscribe), and closing over the
        // context would keep the whole SwiftUI environment alive with them.
        let coordinator = context.coordinator
        model.subscribe(
            term.id,
            onSeed: { [coordinator] _, _, data in coordinator.seed(data) },
            onOutput: { [coordinator] data in coordinator.feed(data) }
        )
        // The composer submits through here so the page can apply bracketed-paste.
        model.terminalSubmit[term.id] = { [coordinator] text in coordinator.submit(text) }
        // The composer's "@ terminal output" mention captures this phone's own
        // xterm scrollback through here.
        model.terminalCapture[term.id] = { [coordinator] lines, done in coordinator.capture(lines, done) }
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {
        context.coordinator.applyTopInset(topInset)
        // Re-assert the PTY size when this phone becomes the owner: taking control
        // triggers no new xterm sizeChanged on its own, so without this the PTY
        // would stay at the previous owner's geometry.
        context.coordinator.controlChanged(controlled: model.isControlled(term.id))
    }

    static func dismantleUIView(_ web: WKWebView, coordinator: Coordinator) {
        let c = web.configuration.userContentController
        ["input", "resize", "ready"].forEach { c.removeScriptMessageHandler(forName: $0) }
        coordinator.model?.terminalSubmit[coordinator.termId] = nil
        coordinator.model?.terminalCapture[coordinator.termId] = nil
        coordinator.model?.unsubscribe(coordinator.termId)
    }

    final class Coordinator: NSObject, WKScriptMessageHandler {
        weak var model: AppModel?
        let termId: String
        weak var web: WKWebView?
        var topInset: CGFloat = 0
        var onFirstContent: (() -> Void)?
        private var ready = false
        private var announcedContent = false
        // Live output is coalesced: instead of one evaluateJavaScript per server
        // message (each a cross-process hop to WebContent), we accumulate bytes and
        // flush a single write per runloop tick. Big win under bursty output.
        private var feedBuffer = Data()
        private var flushScheduled = false
        // A seed that arrives before the page is ready; only the latest matters
        // since it's a full snapshot of the screen.
        private var pendingSeed: String?
        // Last size xterm fitted to, and whether this phone currently owns the
        // terminal — so ownership handoff can re-drive the PTY to the phone's size.
        private var lastCols = 0
        private var lastRows = 0
        private var wasControlled = false

        init(model: AppModel, termId: String) { self.model = model; self.termId = termId }

        /// On gaining ownership, resend the last fitted size so the PTY resizes to
        /// this phone (model.resize drops sizes while not the owner, and a claim
        /// fires no fresh sizeChanged).
        func controlChanged(controlled: Bool) {
            defer { wasControlled = controlled }
            guard controlled, !wasControlled, lastCols > 0, lastRows > 0 else { return }
            model?.resize(termId, cols: lastCols, rows: lastRows)
        }

        /// Submit a composed message via the page's bracketed-paste-aware helper.
        func submit(_ text: String) {
            let b64 = Data(text.utf8).base64EncodedString()
            web?.evaluateJavaScript("window.lpmSubmit('\(b64)')")
        }

        /// Capture the last `lines` of this phone's xterm buffer as text, for the
        /// composer's "@ terminal output" mention. Returns "" if the page isn't up.
        func capture(_ lines: Int, _ done: @escaping (String) -> Void) {
            guard let web else { done(""); return }
            web.evaluateJavaScript("window.lpmCapture(\(lines))") { result, _ in
                done(result as? String ?? "")
            }
        }

        func seed(_ data: String) {
            // A seed resets the emulator and replays the whole screen, so any output
            // buffered before it is stale — drop it.
            feedBuffer.removeAll(keepingCapacity: true)
            guard ready else { pendingSeed = data; return }
            evalSeed(data)
        }

        func feed(_ data: String) {
            feedBuffer.append(contentsOf: data.utf8)
            guard ready, !flushScheduled else { return }
            flushScheduled = true
            DispatchQueue.main.async { [weak self] in self?.flush() }
        }

        private func flush() {
            flushScheduled = false
            guard ready, !feedBuffer.isEmpty else { return }
            let b64 = feedBuffer.base64EncodedString()
            feedBuffer.removeAll(keepingCapacity: true)
            web?.evaluateJavaScript("window.lpmFeed('\(b64)')")
            announceContent()
        }

        private func evalSeed(_ data: String) {
            let b64 = Data(data.utf8).base64EncodedString()
            web?.evaluateJavaScript("window.lpmSeed('\(b64)')")
            announceContent()
        }

        private func announceContent() {
            guard !announcedContent else { return }
            announcedContent = true
            onFirstContent?()
            flushPendingPrompt()
        }

        /// If "Ask agent…" queued a prompt for this terminal, submit it once the
        /// screen has seeded — a short delay lets xterm apply the seed (which turns
        /// on the running program's bracketed-paste mode) before the paste lands.
        private func flushPendingPrompt() {
            guard let model, let prompt = model.pendingAgentPrompt[termId] else { return }
            model.pendingAgentPrompt[termId] = nil
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
                self?.submit(prompt)
            }
        }

        func applyTopInset(_ inset: CGFloat) {
            topInset = inset
            guard ready else { return }
            web?.evaluateJavaScript("window.lpmSetTopInset(\(Int(inset)))")
        }

        func userContentController(_ c: WKUserContentController, didReceive msg: WKScriptMessage) {
            switch msg.name {
            case "input":
                if let text = msg.body as? String { model?.input(termId, text) }
            case "resize":
                if let d = msg.body as? [String: Any],
                   let cols = d["cols"] as? Int, let rows = d["rows"] as? Int {
                    lastCols = cols
                    lastRows = rows
                    model?.resize(termId, cols: cols, rows: rows)
                }
            case "ready":
                ready = true
                web?.evaluateJavaScript("window.lpmSetTopInset(\(Int(topInset)))")
                // Seed first (full snapshot), then any output that arrived after it.
                // No auto-focus: opening a terminal shouldn't raise the keyboard —
                // the user taps the terminal when they want to type.
                if let s = pendingSeed { pendingSeed = nil; evalSeed(s) }
                flush()
            default:
                break
            }
        }
    }
}

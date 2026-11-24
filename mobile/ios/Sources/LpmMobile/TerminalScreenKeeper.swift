import Foundation
import WebKit

/// Keeps a terminal's screen for reading while the Mac is away, and shows the one kept
/// from before until something live is up.
@MainActor
final class TerminalScreenKeeper {
    weak var web: WKWebView?
    /// The terminal's screen is worth keeping.
    var keeps = false
    /// The kept screen is up.
    var onShown: (() -> Void)?

    private weak var model: AppModel?
    private let terminal: String
    private var ready = false
    // The page shows something live rather than a screen kept from before.
    private var drawn = false
    private var saved: String?
    private var shown: String?
    // When what the page shows was last live, on which Mac, and its next keeping, which
    // output that never stops can't put off past `saveBy`.
    private var lastLive = Date()
    private var liveMac: UUID?
    private var saveWork: DispatchWorkItem?
    private var saveBy: Date?
    private var keptOne = false

    init(model: AppModel, terminal: String) {
        self.model = model
        self.terminal = terminal
    }

    /// The page is up, with whatever live content was waiting for it already in.
    func pageReady() {
        ready = true
        show(saved)
    }

    func pageLost() {
        ready = false
        drawn = false
        shown = nil
    }

    /// Show the screen kept from before, unless something live is already up. The Mac's
    /// seed starts the page over, so nothing of it outlasts the link coming back.
    func show(_ saved: String?) {
        self.saved = saved
        guard ready, !drawn, let saved, saved != shown else { return }
        shown = saved
        let b64 = Data(saved.utf8).base64EncodedString()
        web?.evaluateJavaScript("window.lpmShowSaved('\(b64)')") { [weak self] _, _ in
            self?.onShown?()
        }
    }

    /// Keep the screen once its output goes quiet.
    func noteLive() {
        drawn = true
        lastLive = Date()
        liveMac = model?.activeMacId
        guard keeps else { return }
        if saveWork != nil, let saveBy, saveBy.timeIntervalSinceNow < 2 { return }
        // The first one soon, however busy it is, for a tab that's only glanced at.
        if saveBy == nil { saveBy = Date().addingTimeInterval(keptOne ? 15 : 0) }
        saveWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.save() }
        saveWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + (keptOne ? 2 : 0.5), execute: work)
    }

    /// Keeps what's on screen now, unless it already was.
    func save() {
        guard let saveWork else { return }
        saveWork.cancel()
        self.saveWork = nil
        saveBy = nil
        guard keeps, ready, drawn, let web, let mac = liveMac else { return }
        keptOne = true
        let at = lastLive
        let (model, terminal) = (model, terminal)
        web.evaluateJavaScript("window.lpmSnapshot()") { result, _ in
            guard let text = result as? String else { return }
            model?.keepScreen(terminal, text, at: at, mac: mac)
        }
    }
}

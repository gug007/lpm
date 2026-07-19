import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// One queued attachment in the composer: an image (Photos/Camera/clipboard) or an
/// arbitrary file (Files). It uploads to the Mac in the background as soon as it's
/// added; the returned Mac path is held here and appended to the outgoing message
/// on send, never shown in the text field.
struct Attachment: Identifiable {
    enum Kind { case image, file }
    enum Status {
        case uploading
        case uploaded(String) // the on-Mac path
        case failed(String)
    }

    let id = UUID()
    let kind: Kind
    let filename: String
    let mime: String
    /// A small preview for image chips (nil for files).
    var thumbnail: UIImage?
    var status: Status = .uploading
    /// Per-upload id the server echoes, matching this chip's reply regardless of
    /// order. Changes on retry so a late reply for a superseded attempt is ignored.
    var reqId: String = ""

    var macPath: String? {
        if case .uploaded(let p) = status { return p }
        return nil
    }
    var isPending: Bool { if case .uploading = status { return true }; return false }
    var isFailed: Bool { if case .failed = status { return true }; return false }

    /// A compact value that changes whenever anything the chips render changes,
    /// for cheap Equatable diffing of the attachments row.
    var renderToken: String {
        let state: String
        switch status {
        case .uploading: state = "u"
        case .uploaded(let p): state = "d:" + p
        case .failed(let e): state = "f:" + e
        }
        return "\(id.uuidString)|\(state)|\(thumbnail == nil ? 0 : 1)"
    }
}

/// One prepared prompt: its own text and attachments. Terminals can hold several
/// (the tab strip), each edited independently.
struct ComposerTab: Identifiable {
    let id = UUID()
    var text: String = ""
    var attachments: [Attachment] = []

    var preview: String {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if !t.isEmpty { return String(t.prefix(24)) }
        if !attachments.isEmpty { return "\(attachments.count) attachment\(attachments.count == 1 ? "" : "s")" }
        return "Empty"
    }
}

/// One arriving rewrite variant for the picker (N > 1); `text` on success,
/// `error` on failure.
struct TransformVariant: Identifiable {
    let id = UUID()
    let idx: Int
    let text: String?
    let error: String?
}

/// Per-terminal composer state: the prompt tabs (text + attachments) plus the
/// in-flight AI-rewrite (transform) state. Held by AppModel keyed by terminal id so
/// it survives leaving and re-entering a terminal within the app session — mirroring
/// the desktop's session-scoped composer drafts.
@MainActor
final class ComposerStore: ObservableObject {
    let termId: String
    let project: String
    let label: String
    weak var model: AppModel?

    @Published var tabs: [ComposerTab] = [ComposerTab()]
    @Published var activeIndex: Int = 0

    // AI rewrite (transform).
    @Published var transforming = false
    @Published var showVariants = false
    @Published var variants: [TransformVariant] = []
    @Published var transformError: String?
    private var transformReqId: String?
    private var transformVariantCount = 1
    // The tab the rewrite was started on, so its result lands on that tab even if
    // the user switched or closed tabs meanwhile (dropped if the tab is gone).
    private var transformTabId: UUID?
    // Latches once the variants picker has auto-opened, so dismissing it doesn't
    // re-present when the next variant streams in.
    private var openedVariants = false
    // Invalidates a stale transform timeout once a newer transform/cancel supersedes it.
    private var transformTimeoutGen = 0
    private let transformTimeout: TimeInterval = 180

    // Retained upload payloads (base64 + mime + name) keyed by attachment id, so a
    // failed upload can be retried without re-picking the source. Dropped on success.
    private var uploadPayloads: [UUID: (b64: String, mime: String, name: String?)] = [:]
    // Attachment ids awaiting an upload reply, in send order — only a FIFO fallback
    // for an old server that doesn't echo `reqId` (new servers match by reqId).
    private var pendingOrder: [UUID] = []

    // Bidirectional draft sync with the Mac (and any other paired phone). The
    // active tab's text is pushed here (debounced); an inbound remote draft is
    // applied unless the user is actively typing. `lastAppliedDraftRev` drops stale
    // frames; `applyingRemote` stops an applied draft from echoing back out.
    private var draftSendWork: DispatchWorkItem?
    private var lastLocalEditAt = Date.distantPast
    private var lastAppliedDraftRev = 0
    private var applyingRemote = false
    /// Set by the composer view from its FocusState so an inbound draft can yield
    /// to a user who is focused and typing here.
    var isEditorFocused = false

    init(termId: String, project: String, label: String, model: AppModel) {
        self.termId = termId
        self.project = project
        self.label = label
        self.model = model
    }

    // MARK: active tab access

    var activeTab: ComposerTab {
        tabs.indices.contains(activeIndex) ? tabs[activeIndex] : ComposerTab()
    }
    var text: String {
        get { tabs.indices.contains(activeIndex) ? tabs[activeIndex].text : "" }
        set {
            if tabs.indices.contains(activeIndex) { tabs[activeIndex].text = newValue }
            if !applyingRemote { noteLocalEdit(newValue) }
        }
    }
    var attachments: [Attachment] {
        tabs.indices.contains(activeIndex) ? tabs[activeIndex].attachments : []
    }
    var textBinding: Binding<String> {
        Binding(get: { self.text }, set: { self.text = $0 })
    }

    /// Insert text at the end of the active tab, adding a separating space when the
    /// field doesn't already end in whitespace.
    func appendText(_ s: String, spaced: Bool = true) {
        guard tabs.indices.contains(activeIndex) else { return }
        var t = tabs[activeIndex].text
        if spaced, !t.isEmpty, !t.hasSuffix(" "), !t.hasSuffix("\n") { t += " " }
        t += s
        tabs[activeIndex].text = t
    }

    // MARK: tabs

    func newTab() {
        tabs.append(ComposerTab())
        activeIndex = tabs.count - 1
    }
    func switchTab(_ index: Int) {
        guard tabs.indices.contains(index) else { return }
        activeIndex = index
    }
    func closeTab(_ index: Int) {
        guard tabs.count > 1, tabs.indices.contains(index) else { return }
        tabs.remove(at: index)
        if activeIndex >= tabs.count { activeIndex = tabs.count - 1 }
        else if index < activeIndex { activeIndex -= 1 }
    }

    /// After a successful send: close the sent tab if others remain, else clear it
    /// in place (mirrors the desktop's "sent prompt closes its tab, else resets").
    func afterSend() {
        if tabs.count > 1 {
            closeTab(activeIndex)
        } else {
            tabs[0] = ComposerTab()
            activeIndex = 0
        }
        // The active input is now empty; push the cleared draft to the phone's Mac
        // immediately rather than waiting out the debounce.
        draftSendWork?.cancel()
        draftSendWork = nil
        model?.sendComposerDraft(termId, text: text)
    }

    // MARK: attachments

    /// Append an image placeholder chip (main, in call order so multi-select keeps
    /// selection order) and return its id; the caller fills it once encoded.
    @discardableResult
    func reserveImagePlaceholder() -> UUID {
        let att = Attachment(kind: .image, filename: "image.jpg", mime: "image/jpeg", thumbnail: nil)
        if tabs.indices.contains(activeIndex) { tabs[activeIndex].attachments.append(att) }
        return att.id
    }

    /// A camera/clipboard image: reserve its chip, then downscale + JPEG-encode off
    /// the main thread before sending.
    func addImage(_ image: UIImage) {
        let id = reserveImagePlaceholder()
        encodeImageOffMain(id, image: image)
    }

    /// Fill a reserved placeholder from Photos-picker Data: decode + encode all off
    /// the main thread so a 10-photo selection never serializes on it.
    func fillImageUpload(_ id: UUID, data: Data?) {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let result = data.flatMap { UIImage(data: $0) }.flatMap { Self.encodeImageForUpload($0) }
            DispatchQueue.main.async {
                guard let self else { return }
                if let result { self.beginUpload(id, b64: result.b64, mime: "image/jpeg", name: nil, thumbnail: result.thumb) }
                // Encode failed before any upload existed — nothing to retry, so
                // drop the placeholder (the pre-placeholder behavior).
                else { self.removeAttachment(id) }
            }
        }
    }

    private func encodeImageOffMain(_ id: UUID, image: UIImage) {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let result = Self.encodeImageForUpload(image)
            DispatchQueue.main.async {
                guard let self else { return }
                if let result { self.beginUpload(id, b64: result.b64, mime: "image/jpeg", name: nil, thumbnail: result.thumb) }
                else { self.removeAttachment(id) }
            }
        }
    }

    /// Downscale + JPEG-encode + base64 + build a thumbnail — pure CPU work, safe to
    /// run off the actor.
    private nonisolated static func encodeImageForUpload(_ image: UIImage) -> (b64: String, thumb: UIImage)? {
        guard let b64 = image.downscaledForUpload(maxDimension: 2048)
            .jpegData(compressionQuality: 0.7)?.base64EncodedString() else { return nil }
        return (b64, image.downscaledForUpload(maxDimension: 240))
    }

    func addFile(_ url: URL) {
        let name = url.lastPathComponent
        let mime = (UTType(filenameExtension: url.pathExtension)?.preferredMIMEType) ?? "application/octet-stream"
        let att = Attachment(kind: .file, filename: name, mime: mime, thumbnail: nil)
        let id = att.id
        if tabs.indices.contains(activeIndex) { tabs[activeIndex].attachments.append(att) }
        // Read + base64-encode off the main thread (a large file blocks it otherwise).
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let scoped = url.startAccessingSecurityScopedResource()
            let b64 = (try? Data(contentsOf: url))?.base64EncodedString()
            if scoped { url.stopAccessingSecurityScopedResource() }
            DispatchQueue.main.async {
                guard let self else { return }
                if let b64 { self.beginUpload(id, b64: b64, mime: mime, name: name, thumbnail: nil) }
                else { self.removeAttachment(id) }
            }
        }
    }

    /// Set the chip's thumbnail and fire its upload (main). Called after encoding.
    private func beginUpload(_ id: UUID, b64: String, mime: String, name: String?, thumbnail: UIImage?) {
        if let thumbnail { updateAttachment(id) { $0.thumbnail = thumbnail } }
        dispatchUpload(id, b64: b64, mime: mime, name: name)
    }

    /// Tag the chip with a fresh reqId the server echoes (so the reply matches this
    /// exact chip regardless of arrival order), retain the payload for retry, record
    /// FIFO order (old-server fallback), and send.
    private func dispatchUpload(_ id: UUID, b64: String, mime: String, name: String?) {
        let reqId = UUID().uuidString
        uploadPayloads[id] = (b64, mime, name)
        pendingOrder.append(id)
        updateAttachment(id) { att in att.status = .uploading; att.reqId = reqId }
        model?.sendUpload(termId, b64: b64, mime: mime, name: name, reqId: reqId)
    }

    private func failUpload(_ id: UUID) {
        updateAttachment(id) { $0.status = .failed("Upload failed") }
    }

    /// Retry a failed upload with its retained payload and a new reqId (so a late
    /// reply for the prior attempt can't mis-resolve this chip).
    func retryUpload(_ id: UUID) {
        guard let payload = uploadPayloads[id] else { return }
        dispatchUpload(id, b64: payload.b64, mime: payload.mime, name: payload.name)
    }

    func removeAttachment(_ id: UUID) {
        for i in tabs.indices { tabs[i].attachments.removeAll { $0.id == id } }
        uploadPayloads[id] = nil
        pendingOrder.removeAll { $0 == id }
    }

    /// An upload reply landed: match it to its chip by `reqId` (empty reqId ⇒ old
    /// server, fall back to the oldest still-pending chip). Empty path ⇒ failed.
    func resolveUpload(reqId: String, path: String) {
        let attId: UUID?
        if !reqId.isEmpty {
            attId = tabs.flatMap(\.attachments).first { $0.reqId == reqId && $0.isPending }?.id
        } else {
            attId = pendingOrder.first
        }
        guard let attId else { return }
        pendingOrder.removeAll { $0 == attId }
        updateAttachment(attId) { att in
            att.status = path.isEmpty ? .failed("Upload failed") : .uploaded(path)
        }
        if !path.isEmpty { uploadPayloads[attId] = nil }
    }

    /// The link dropped: fail every still-uploading chip so Send isn't blocked
    /// forever; the retained payload lets the user retry once reconnected.
    func failInFlightUploads() {
        guard !pendingOrder.isEmpty else { return }
        pendingOrder.removeAll()
        for i in tabs.indices {
            for j in tabs[i].attachments.indices where tabs[i].attachments[j].isPending {
                tabs[i].attachments[j].status = .failed("Upload interrupted")
            }
        }
    }

    private func updateAttachment(_ id: UUID, _ mutate: (inout Attachment) -> Void) {
        for i in tabs.indices {
            if let j = tabs[i].attachments.firstIndex(where: { $0.id == id }) {
                mutate(&tabs[i].attachments[j])
                return
            }
        }
    }

    /// Whether the active tab can be sent, and the message body to send (text plus
    /// the uploaded attachments' Mac paths, in chip order). Blocked while any
    /// attachment is still uploading; failed attachments are dropped.
    enum SendState {
        case ready(String)
        case pending          // an upload is still in flight
        case droppedFailures(String) // sent, but some failed uploads were dropped
        case empty
    }
    func sendState() -> SendState {
        let tab = activeTab
        if tab.attachments.contains(where: { $0.isPending }) { return .pending }
        let paths = tab.attachments.compactMap { $0.macPath }
        let hadFailures = tab.attachments.contains { $0.isFailed }
        var body = tab.text
        if !paths.isEmpty {
            let joined = paths.joined(separator: " ")
            if body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { body = joined }
            else { body = body + (body.hasSuffix(" ") || body.hasSuffix("\n") ? "" : " ") + joined }
        }
        if body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return .empty }
        return hadFailures ? .droppedFailures(body) : .ready(body)
    }

    // MARK: draft sync

    /// A local text edit: record the timestamp (so a racing remote apply yields to
    /// the typist) and schedule a debounced push to the Mac.
    private func noteLocalEdit(_ text: String) {
        lastLocalEditAt = Date()
        draftSendWork?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.draftSendWork = nil
            self.model?.sendComposerDraft(self.termId, text: text)
        }
        draftSendWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25, execute: work)
    }

    /// Apply a draft mirrored from the Mac. Drops a stale/own-echo frame, and — when
    /// the user is focused and typing here — yields to them. A `seed`-carried draft
    /// only fills the active input when it's empty, so a reconnect never clobbers a
    /// prompt in progress.
    func applyRemoteDraft(text: String, rev: Int, origin: String, isSeed: Bool) {
        if rev <= lastAppliedDraftRev { return }
        lastAppliedDraftRev = rev
        if let mine = model?.selfDeviceId, !mine.isEmpty, origin == mine { return }
        if isEditorFocused, Date().timeIntervalSince(lastLocalEditAt) < 1.5 { return }
        if isSeed, !(tabs.indices.contains(activeIndex) && tabs[activeIndex].text.isEmpty) { return }
        draftSendWork?.cancel()
        draftSendWork = nil
        applyingRemote = true
        setText(text, tabId: activeTab.id)
        applyingRemote = false
    }

    // MARK: transform (AI rewrite)

    func startTransform(instruction: String, variants: Int) {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        transforming = true
        transformError = nil
        self.variants = []
        showVariants = false
        transformVariantCount = max(1, min(5, variants))
        transformTabId = activeTab.id
        openedVariants = false
        transformReqId = model?.runTransform(termId: termId, project: project,
                                             instruction: instruction, text: text,
                                             variants: transformVariantCount)
        armTransformTimeout()
    }

    /// Cancel = stop waiting client-side; late frames for this reqId are ignored.
    func cancelTransform() {
        releaseTransform()
        showVariants = false
        variants = []
    }

    func receiveTransformVariant(reqId: String, idx: Int, text: String?, error: String?) {
        guard reqId == transformReqId else { return }
        variants.append(TransformVariant(idx: idx, text: text, error: error))
        armTransformTimeout() // reset the timeout on each arriving frame
        // For a multi-variant run, open the picker as soon as the first result
        // arrives so the rest stream in live (the composer stays locked underneath).
        // Latched so a manual dismiss doesn't re-present on the next frame.
        if transformVariantCount > 1, !openedVariants {
            openedVariants = true
            showVariants = true
        }
    }

    func finishTransform(reqId: String, ok: Bool) {
        guard reqId == transformReqId else { return }
        let tabId = transformTabId
        releaseTransform() // release the lock/route/timeout; leaves the picker state alone
        guard ok else {
            showVariants = false
            transformError = "The rewrite couldn’t be completed. Try again."
            variants = []
            return
        }
        if transformVariantCount == 1 {
            showVariants = false
            if let applied = variants.compactMap(\.text).first {
                setText(applied, tabId: tabId)
            } else {
                transformError = "The rewrite couldn’t be completed. Try again."
            }
            variants = []
        }
        // Multi-variant success: the picker is already open and MUST stay open
        // (transformDone lands ms after the last variant) until the user picks a
        // variant or dismisses the sheet.
    }

    /// Commit a picked variant back to the tab the rewrite started on.
    func applyVariant(_ text: String) {
        let tabId = transformTabId
        releaseTransform()
        showVariants = false
        setText(text, tabId: tabId)
        variants = []
    }

    /// The variants sheet was dismissed. If it closed while still streaming, cancel
    /// the run; otherwise just drop the (unpicked) variants.
    func variantsSheetDismissed() {
        if transforming { releaseTransform() }
        variants = []
    }

    /// Release the in-flight transform's lock, reqId, timeout, and route WITHOUT
    /// touching the picker (showVariants) or the streamed variants — so a completed
    /// multi-variant batch leaves its picker open for the user to choose from.
    private func releaseTransform() {
        let reqId = transformReqId
        transformReqId = nil
        transforming = false
        transformTimeoutGen &+= 1
        model?.clearTransformRoute(reqId)
    }

    /// Write text to a specific tab by id; a no-op (result dropped) if it's gone.
    private func setText(_ text: String, tabId: UUID?) {
        guard let tabId, let i = tabs.firstIndex(where: { $0.id == tabId }) else { return }
        tabs[i].text = text
    }

    /// Unlock with an error if `transformDone` never arrives (dropped frame / drop).
    private func armTransformTimeout() {
        transformTimeoutGen &+= 1
        let gen = transformTimeoutGen
        let reqId = transformReqId
        DispatchQueue.main.asyncAfter(deadline: .now() + transformTimeout) { [weak self] in
            guard let self, self.transformTimeoutGen == gen, self.transformReqId == reqId, self.transforming
            else { return }
            self.releaseTransform()
            self.showVariants = false
            self.variants = []
            self.transformError = "The rewrite timed out. Try again."
        }
    }
}

extension UIImage {
    /// Shrink so the longest side is at most `maxDimension`, keeping aspect ratio;
    /// returns self when already small enough. Keeps upload payloads small.
    func downscaledForUpload(maxDimension: CGFloat) -> UIImage {
        let longest = max(size.width, size.height)
        guard longest > maxDimension else { return self }
        let scale = maxDimension / longest
        let target = CGSize(width: size.width * scale, height: size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: target)
        return renderer.image { _ in draw(in: CGRect(origin: .zero, size: target)) }
    }
}

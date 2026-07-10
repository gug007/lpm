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
        set { if tabs.indices.contains(activeIndex) { tabs[activeIndex].text = newValue } }
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
    }

    // MARK: attachments

    func addImage(_ image: UIImage) {
        guard let jpeg = image.downscaledForUpload(maxDimension: 2048).jpegData(compressionQuality: 0.7) else { return }
        var att = Attachment(kind: .image, filename: "image.jpg", mime: "image/jpeg",
                             thumbnail: image.downscaledForUpload(maxDimension: 240))
        startUpload(&att, base64: jpeg.base64EncodedString(), mime: "image/jpeg", name: nil)
    }

    func addFile(_ url: URL) {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url) else { return }
        let name = url.lastPathComponent
        let mime = (UTType(filenameExtension: url.pathExtension)?.preferredMIMEType) ?? "application/octet-stream"
        var att = Attachment(kind: .file, filename: name, mime: mime, thumbnail: nil)
        startUpload(&att, base64: data.base64EncodedString(), mime: mime, name: name)
    }

    /// Append the chip and fire its upload, tagged with a fresh reqId the server
    /// echoes so the reply matches this exact chip regardless of arrival order.
    private func startUpload(_ att: inout Attachment, base64: String, mime: String, name: String?) {
        guard tabs.indices.contains(activeIndex) else { return }
        let reqId = UUID().uuidString
        att.reqId = reqId
        uploadPayloads[att.id] = (base64, mime, name)
        pendingOrder.append(att.id)
        tabs[activeIndex].attachments.append(att)
        model?.sendUpload(termId, b64: base64, mime: mime, name: name, reqId: reqId)
    }

    /// Retry a failed upload with its retained payload and a new reqId (so a late
    /// reply for the prior attempt can't mis-resolve this chip).
    func retryUpload(_ id: UUID) {
        guard let payload = uploadPayloads[id] else { return }
        let reqId = UUID().uuidString
        pendingOrder.append(id)
        updateAttachment(id) { att in att.status = .uploading; att.reqId = reqId }
        model?.sendUpload(termId, b64: payload.b64, mime: payload.mime, name: payload.name, reqId: reqId)
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

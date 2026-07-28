import Foundation

/// A file the user is about to attach to a note. Raw bytes, held in memory only.
struct NoteAttachmentDraft {
    let name: String
    let mimeType: String
    let data: Data
}

/// Attachment bytes for the notes screens, split out of `NotesStore` so that
/// file stays focused; reached as `model.notes.attachments`. Its `model` is set
/// for it whenever the notes store's is, so there is no second wiring step.
///
/// Bytes live in this cache and nowhere else: they are never written to the
/// phone's disk, because the notebook is encrypted on the Mac and this link is
/// the only place its plaintext exists off it.
@Observable @MainActor
final class NoteAttachmentStore {
    @ObservationIgnored weak var model: AppModel?
    private var client: LpmClient? { model?.client }

    /// Per-file ceiling on this link — attachments ride inline as base64, which
    /// the Mac refuses above this. Bigger files stay a Mac job.
    static let byteLimit = 8 * 1024 * 1024
    private static let cacheLimit = 32 * 1024 * 1024

    var loading: Set<String> = []
    var error: [String: String] = [:]

    @ObservationIgnored private var cache: [String: Data] = [:]
    @ObservationIgnored private var order: [String] = []
    @ObservationIgnored private let timeout = GenerationTimeout<String>()

    func data(_ hash: String) -> Data? { cache[hash] }

    /// Fetch one attachment's bytes, cached by hash for the session. `size` comes
    /// from the note itself, so an over-cap file is refused without asking.
    func fetch(project: String, hash: String, size: Int) {
        guard cache[hash] == nil, !loading.contains(hash) else { return }
        guard size <= Self.byteLimit else {
            error[hash] = "This attachment is too large to open on your phone. Open it on your Mac instead."
            return
        }
        loading.insert(hash)
        error[hash] = nil
        client?.requestNotesAttachment(project: project, hash: hash)
        timeout.arm(hash, seconds: 60) { [weak self] in
            guard let self, self.loading.remove(hash) != nil else { return }
            self.error[hash] = "Couldn't open the attachment. Try again."
        }
    }

    func apply(hash: String, data encoded: String?, error message: String?) {
        timeout.cancel(hash)
        loading.remove(hash)
        guard let encoded, let bytes = Data(base64Encoded: encoded) else {
            error[hash] = message ?? "Couldn't open the attachment."
            return
        }
        store(hash, bytes)
        error[hash] = nil
    }

    func handleConnectionReset() {
        timeout.cancelAll()
        loading = []
    }

    private func store(_ hash: String, _ bytes: Data) {
        cache[hash] = bytes
        order.append(hash)
        var total = cache.values.reduce(0) { $0 + $1.count }
        while total > Self.cacheLimit, order.count > 1 {
            total -= cache.removeValue(forKey: order.removeFirst())?.count ?? 0
        }
    }
}

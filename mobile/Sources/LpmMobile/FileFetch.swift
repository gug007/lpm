import Foundation

/// One `fileChunk` reply: a byte range of a file on the Mac, plus the file's
/// current size and mtime so a fetch can tell it changed between ranges. The
/// base64 decode happens here, on the client's parse queue, not on main.
struct FileChunk {
    let reqId: String
    let path: String
    let size: Int64
    let mtime: Int64
    let offset: Int64
    let data: Data
    let error: String?
    /// The file isn't there — the cue to try the next reading of a tapped path.
    let missing: Bool

    init(_ o: [String: Any]) {
        reqId = Wire.reqIdString(o["reqId"])
        path = o["path"] as? String ?? ""
        size = (o["size"] as? NSNumber)?.int64Value ?? 0
        mtime = (o["mtime"] as? NSNumber)?.int64Value ?? 0
        offset = (o["offset"] as? NSNumber)?.int64Value ?? 0
        let ok = o["ok"] as? Bool ?? false
        missing = o["missing"] as? Bool ?? false
        let decoded = ok ? Data(base64Encoded: o["data"] as? String ?? "") : nil
        data = decoded ?? Data()
        error = ok ? (decoded == nil ? "Couldn't read the file." : nil)
                   : (o["error"] as? String ?? "Couldn't read the file.")
    }
}

/// Pulls one file off the Mac for the preview sheet, a few byte ranges at a time,
/// into a scratch file the preview then opens. Ranges may land in any order (the
/// Mac reads each on its own thread), so each is written at its own offset.
@Observable @MainActor
final class FileFetch {
    enum Phase: Equatable {
        case loading
        case ready(URL, kind: FilePreviewKind, truncated: Bool)
        case failed(String)
    }

    let project: String
    /// The reading of the path being fetched; see `candidates`.
    private(set) var path: String
    private(set) var phase: Phase = .loading
    private(set) var received: Int64 = 0
    /// Bytes this preview will fetch — the whole file, or the head of a long text.
    private(set) var total: Int64?

    @ObservationIgnored weak var model: AppModel?
    /// Called once the fetch is ready or has failed, for callers that aren't views.
    @ObservationIgnored var onDone: ((Phase) -> Void)?
    @ObservationIgnored private(set) var token = UUID().uuidString
    // Readings of a tapped path, most likely first; the first that exists wins.
    @ObservationIgnored private let candidates: [String]
    @ObservationIgnored private var size: Int64 = 0
    @ObservationIgnored private var mtime: Int64 = 0
    @ObservationIgnored private var kind: FilePreviewKind = .document
    @ObservationIgnored private var nextOffset: Int64 = 0
    @ObservationIgnored private var pending: [Int64: Int64] = [:]
    @ObservationIgnored private var handle: FileHandle?
    @ObservationIgnored private var fileURL: URL?
    @ObservationIgnored private var stalls = 0
    @ObservationIgnored private var watchdog: Task<Void, Never>?

    static let chunkSize: Int64 = 256 * 1024
    static let window = 8
    static let maxBytes: Int64 = 1 << 30
    static let textCap: Int64 = 1 << 20
    private static let stallTimeout: Duration = .seconds(20)
    private static let maxStalls = 2

    init(project: String, candidates: [String]) {
        self.project = project
        self.candidates = candidates
        path = candidates.first ?? ""
    }

    func start(model: AppModel) {
        self.model = model
        model.fileFetches.add(self)
        request(offset: 0, length: Self.chunkSize)
    }

    func retry() { restart(with: candidates.first ?? path) }

    private func restart(with path: String) {
        guard let model else { return }
        close()
        self.path = path
        token = UUID().uuidString
        phase = .loading
        received = 0
        total = nil
        nextOffset = 0
        stalls = 0
        start(model: model)
    }

    /// Stop fetching and delete the scratch file. The sheet calls this on dismiss.
    func close() {
        model?.fileFetches.remove(token)
        watchdog?.cancel()
        pending.removeAll()
        discardFile()
    }

    func apply(_ chunk: FileChunk) {
        guard phase == .loading, let length = pending.removeValue(forKey: chunk.offset) else { return }
        if let error = chunk.error {
            let next = (candidates.firstIndex(of: path) ?? candidates.count) + 1
            if chunk.missing, total == nil, next < candidates.count {
                restart(with: candidates[next])
            } else {
                fail(error)
            }
            return
        }
        stalls = 0
        if total == nil {
            guard begin(chunk) else { return }
        } else if !kind.isText, chunk.size != size || chunk.mtime != mtime {
            fail("The file changed while it was loading.")
            return
        }
        do {
            try handle?.seek(toOffset: UInt64(chunk.offset))
            try handle?.write(contentsOf: chunk.data)
        } catch {
            fail("Couldn't save the file on this iPhone.")
            return
        }
        received += Int64(chunk.data.count)
        if Int64(chunk.data.count) < length { total = min(total ?? 0, chunk.offset + Int64(chunk.data.count)) }
        armWatchdog()
        pump()
    }

    /// The link dropped: whatever was in flight died with the socket, so ask again.
    func resend() {
        for (offset, length) in pending { send(offset: offset, length: length) }
    }

    func cancel(_ message: String) { fail(message) }

    // MARK: -

    private func begin(_ chunk: FileChunk) -> Bool {
        size = chunk.size
        mtime = chunk.mtime
        let name = ((chunk.path.isEmpty ? path : chunk.path) as NSString).lastPathComponent
        kind = FilePreviewKind.classify(name: name, head: chunk.data)
        if kind.isText {
            total = min(size, Self.textCap)
        } else if size > Self.maxBytes {
            fail("This file is over 1 GB — too large to open on iPhone.")
            return false
        } else {
            total = size
        }
        nextOffset = chunk.offset + Self.chunkSize
        do {
            let dir = FileFetchRouter.scratchRoot.appendingPathComponent(token, isDirectory: true)
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let url = dir.appendingPathComponent(name.isEmpty ? "file" : name)
            guard FileManager.default.createFile(atPath: url.path, contents: nil) else {
                throw CocoaError(.fileWriteUnknown)
            }
            handle = try FileHandle(forWritingTo: url)
            fileURL = url
        } catch {
            fail("Couldn't save the file on this iPhone.")
            return false
        }
        return true
    }

    private func pump() {
        guard let total else { return }
        while pending.count < Self.window, nextOffset < total {
            let length = min(Self.chunkSize, total - nextOffset)
            request(offset: nextOffset, length: length)
            nextOffset += length
        }
        if pending.isEmpty, nextOffset >= total { finish() }
    }

    private func finish() {
        watchdog?.cancel()
        try? handle?.truncate(atOffset: UInt64(total ?? 0))
        try? handle?.close()
        handle = nil
        guard let fileURL else { fail("Couldn't read the file."); return }
        phase = .ready(fileURL, kind: kind, truncated: size > (total ?? size))
        onDone?(phase)
    }

    private func fail(_ message: String) {
        close()
        phase = .failed(message)
        onDone?(phase)
    }

    private func request(offset: Int64, length: Int64) {
        pending[offset] = length
        send(offset: offset, length: length)
        armWatchdog()
    }

    private func send(offset: Int64, length: Int64) {
        model?.client?.fileChunk(reqId: "\(token):\(offset)", project: project,
                                 path: path, offset: offset, length: length)
    }

    /// A reply can be lost (a full queue on the Mac, a dropped link): re-ask for
    /// whatever is still missing, and give up after a few silent rounds. A Mac
    /// that never answers at all is one too old to know the request.
    private func armWatchdog() {
        watchdog?.cancel()
        watchdog = Task { [weak self] in
            try? await Task.sleep(for: Self.stallTimeout)
            guard !Task.isCancelled else { return }
            self?.stalled()
        }
    }

    private func stalled() {
        guard phase == .loading, !pending.isEmpty else { return }
        guard model?.connection == .ready else { armWatchdog(); return }
        stalls += 1
        if stalls > Self.maxStalls {
            fail(total == nil
                ? "Your Mac didn't send the file. Make sure lpm on your Mac is up to date."
                : "Your Mac stopped sending the file.")
            return
        }
        resend()
        armWatchdog()
    }

    private func discardFile() {
        try? handle?.close()
        handle = nil
        if let dir = fileURL?.deletingLastPathComponent() { try? FileManager.default.removeItem(at: dir) }
        fileURL = nil
    }
}

/// Routes `fileChunk` replies to the fetch that asked, by the token in the reqId.
@MainActor
final class FileFetchRouter {
    static let scratchRoot = FileManager.default.temporaryDirectory
        .appendingPathComponent("FilePreview", isDirectory: true)

    private struct Entry { weak var fetch: FileFetch? }
    private var fetches: [String: Entry] = [:]

    init() {
        // Previews from a previous run that never got to clean up.
        try? FileManager.default.removeItem(at: Self.scratchRoot)
    }

    func add(_ fetch: FileFetch) { fetches[fetch.token] = Entry(fetch: fetch) }
    func remove(_ token: String) { fetches[token] = nil }

    func deliver(_ chunk: FileChunk) {
        guard let token = chunk.reqId.split(separator: ":").first else { return }
        fetches[String(token)]?.fetch?.apply(chunk)
    }

    func handleConnectionReset() {
        fetches.values.forEach { $0.fetch?.resend() }
    }

    /// The phone switched Macs: a path means nothing on the new one.
    func cancelAll() {
        fetches.values.forEach { $0.fetch?.cancel("Disconnected from the Mac this file is on.") }
        fetches.removeAll()
    }
}

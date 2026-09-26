import Foundation
import UniformTypeIdentifiers

/// How the preview sheet shows a file, decided from its name and first bytes.
enum FilePreviewKind: Equatable {
    case text
    case markdown
    case media
    /// Images, PDFs, office documents and anything else — Quick Look's job.
    case document

    var isText: Bool { self == .text || self == .markdown }

    /// Content wins over the extension where they disagree: `.ts` is TypeScript
    /// far more often than an MPEG transport stream, and a real video never reads
    /// as UTF-8 text. Images stay images even when they are text (SVG).
    static func classify(name: String, head: Data) -> FilePreviewKind {
        let ext = (name as NSString).pathExtension.lowercased()
        let type = UTType(filenameExtension: ext)
        if let type, type.conforms(to: .image) || type.conforms(to: .pdf) { return .document }
        if looksLikeText(head) {
            return ["md", "markdown", "mdx"].contains(ext) ? .markdown : .text
        }
        if let type, type.conforms(to: .audiovisualContent) { return .media }
        return .document
    }

    /// No NUL bytes and valid UTF-8, forgiving a multi-byte character cut off at
    /// the end of the sample.
    static func looksLikeText(_ head: Data) -> Bool {
        let sample = head.prefix(8192)
        if sample.contains(0) { return false }
        for cut in 0...min(3, sample.count) {
            if String(data: sample.dropLast(cut), encoding: .utf8) != nil { return true }
        }
        return false
    }
}

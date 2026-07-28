import Foundation

// Session memory wire types + requests. See ../../PROTOCOL.md ("Session memory").
// Timestamps here are unix SECONDS — every Notes timestamp is milliseconds.

/// One work-session log. `content` is a 1200-character preview on a `memory`
/// list and the full markdown on a `memorySession` fetch; `size` is always the
/// document's true byte length.
struct MemorySession: Identifiable {
    let name: String
    let title: String
    let path: String
    let updatedAt: Int   // unix seconds
    let size: Int
    let content: String

    var id: String { name }

    init(_ o: [String: Any]) {
        name = o["name"] as? String ?? ""
        title = o["title"] as? String ?? ""
        path = o["path"] as? String ?? ""
        updatedAt = o["updatedAt"] as? Int ?? 0
        size = o["size"] as? Int ?? 0
        content = o["content"] as? String ?? ""
    }
}

/// The `memory` reply: the sessions plus the folder they live in. `exists` false
/// with a filled `dir` is the empty state, not a failure. A duplicate resolves to
/// its original's folder, so `owner` is read off `dir` rather than the project.
struct MemoryList {
    let exists: Bool
    let dir: String
    let sessions: [MemorySession]

    var owner: String { URL(fileURLWithPath: dir).lastPathComponent }

    init(_ o: [String: Any]) {
        exists = o["exists"] as? Bool ?? false
        dir = o["dir"] as? String ?? ""
        sessions = (o["sessions"] as? [[String: Any]] ?? []).map(MemorySession.init)
    }
}

extension Wire {
    static func memory(project: String) -> String {
        json(["t": "memory", "project": project])
    }
    static func memorySession(project: String, name: String) -> String {
        json(["t": "memorySession", "project": project, "name": name])
    }
    /// Compare-and-swap save. `baseline` present means "write only if the file
    /// still reads exactly like this" — an empty string is a real baseline (the
    /// file must not exist yet), so absence, not emptiness, is what overwrites
    /// unconditionally.
    static func memorySave(project: String, name: String, content: String,
                           baseline: String?) -> String {
        var obj: [String: Any] = ["t": "memorySave", "project": project, "name": name,
                                  "content": content]
        if let baseline { obj["baseline"] = baseline }
        return json(obj)
    }
    static func memoryDelete(project: String, name: String) -> String {
        json(["t": "memoryDelete", "project": project, "name": name])
    }

    /// Turn a typed title into a session slug the Mac accepts as a filename
    /// (`^[a-z0-9][a-z0-9-]{0,63}$`), matching the desktop Memory pane. Returns
    /// "" for a title with nothing usable in it.
    static func slugify(_ raw: String) -> String {
        let lowered = raw.lowercased()
        var slug = ""
        var pendingSeparator = false
        for ch in lowered.unicodeScalars {
            if CharacterSet.alphanumerics.contains(ch), ch.isASCII {
                if pendingSeparator, !slug.isEmpty { slug.append("-") }
                pendingSeparator = false
                slug.unicodeScalars.append(ch)
            } else {
                pendingSeparator = true
            }
        }
        return String(slug.prefix(64))
    }
}

import Foundation

// Notes wire types + requests. See ../../PROTOCOL.md ("Notes").
// Every timestamp here is unix MILLISECONDS — session memory's `updatedAt` is
// seconds.

/// One notebook chat. `updatedAt` orders the list (most recent first).
struct NoteChat: Identifiable {
    let id: String
    let title: String
    let createdAt: Int   // unix millis
    let updatedAt: Int   // unix millis

    init(_ o: [String: Any]) {
        id = o["id"] as? String ?? ""
        title = o["title"] as? String ?? ""
        createdAt = o["createdAt"] as? Int ?? 0
        updatedAt = o["updatedAt"] as? Int ?? 0
    }
}

/// One note. The wire key for the timestamp is `ts`; `editedAt` and
/// `attachments` are omitted entirely when unset, hence the optionals.
struct NoteMessage: Identifiable {
    let id: String
    let chatId: String
    let ts: Int          // unix millis
    let text: String
    let editedAt: Int?   // unix millis
    let attachments: [NoteAttachment]?

    init(_ o: [String: Any]) {
        id = o["id"] as? String ?? ""
        chatId = o["chatId"] as? String ?? ""
        ts = o["ts"] as? Int ?? 0
        text = o["text"] as? String ?? ""
        editedAt = o["editedAt"] as? Int
        attachments = (o["attachments"] as? [[String: Any]]).map { $0.map(NoteAttachment.init) }
    }
}

/// One attached file. `hash` is the sha256 of the plaintext and the key
/// `notesAttachment` takes; `size` is the real byte length, so the phone can
/// refuse a fetch above the link's per-file cap without asking for it.
struct NoteAttachment: Identifiable {
    let hash: String
    let name: String
    let size: Int
    let mimeType: String

    var id: String { hash }

    init(_ o: [String: Any]) {
        hash = o["hash"] as? String ?? ""
        name = o["name"] as? String ?? ""
        size = o["size"] as? Int ?? 0
        mimeType = o["mimeType"] as? String ?? ""
    }
}

/// One search result. `id` is the **message** id, not the chat's.
struct NoteSearchHit: Identifiable {
    let id: String
    let chatId: String
    let chatTitle: String
    let ts: Int          // unix millis
    let snippet: String

    init(_ o: [String: Any]) {
        id = o["id"] as? String ?? ""
        chatId = o["chatId"] as? String ?? ""
        chatTitle = o["chatTitle"] as? String ?? ""
        ts = o["ts"] as? Int ?? 0
        snippet = o["snippet"] as? String ?? ""
    }
}

extension Wire {
    static func notesChats(project: String) -> String {
        json(["t": "notesChats", "project": project])
    }
    static func notesCreateChat(project: String, title: String) -> String {
        json(["t": "notesCreateChat", "project": project, "title": title])
    }
    static func notesRenameChat(project: String, chatId: String, title: String) -> String {
        json(["t": "notesRenameChat", "project": project, "chatId": chatId, "title": title])
    }
    static func notesDeleteChat(project: String, chatId: String) -> String {
        json(["t": "notesDeleteChat", "project": project, "chatId": chatId])
    }
    /// One page, newest first. `beforeId` is the oldest id already held ("" for
    /// the first page) and is echoed on the reply so a late page can be dropped.
    static func notesMessages(project: String, chatId: String, limit: Int,
                              beforeId: String) -> String {
        json(["t": "notesMessages", "project": project, "chatId": chatId,
              "limit": limit, "beforeId": beforeId])
    }
    /// Post a note. Each attachment is `{ name, mimeType, data }` with `data` as
    /// padded base64 of the raw bytes. The Mac refuses anything over 8MiB — the
    /// limit is the WebSocket frame, not the disk.
    static func notesAddMessage(project: String, chatId: String, text: String,
                                attachments: [[String: Any]]) -> String {
        json(["t": "notesAddMessage", "project": project, "chatId": chatId,
              "text": text, "attachments": attachments])
    }
    static func notesEditMessage(project: String, id: String, text: String) -> String {
        json(["t": "notesEditMessage", "project": project, "id": id, "text": text])
    }
    static func notesDeleteMessage(project: String, id: String) -> String {
        json(["t": "notesDeleteMessage", "project": project, "id": id])
    }
    /// Substring search across the project's notes. `query` is echoed back, so a
    /// reply from a superseded keystroke can be dropped.
    static func notesSearch(project: String, query: String, limit: Int) -> String {
        json(["t": "notesSearch", "project": project, "query": query, "limit": limit])
    }
    static func notesAttachment(project: String, hash: String) -> String {
        json(["t": "notesAttachment", "project": project, "hash": hash])
    }
}

import CryptoKit
import Foundation
import UIKit

/// Demo handlers for the Notes notebook: chats, paged notes, posting, editing,
/// deleting, search, and attachment bytes. Everything is mutable fixture state,
/// so a note written in Demo Mode is there when the chat is reopened, and the
/// seeded thread is long enough that paging and a short final page both happen.
///
/// Notes have no change push on a real Mac either — screens refetch — so nothing
/// here pushes.
extension DemoServer {
    func registerNotesHandlers() {
        seedNotesFixtures()

        register("notesChats") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            self.pushAfter(0.4) { [weak self] in
                guard let self else { return nil }
                self.ensureNotebook(project)
                return ["t": "notesChats", "project": project, "ok": true,
                        "chats": self.sortedChats(project).map(self.noteChatDict)]
            }
        }

        register("notesCreateChat") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            let title = (o["title"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            self.pushAfter(0.4) { [weak self] in
                guard let self else { return nil }
                guard !title.isEmpty else {
                    return ["t": "notesCreateChat", "project": project, "ok": false,
                            "error": "Give this chat a name."]
                }
                self.ensureNotebook(project)
                let chat = self.newChat(project, title: title)
                return ["t": "notesCreateChat", "project": project, "ok": true,
                        "chat": self.noteChatDict(chat)]
            }
        }

        register("notesRenameChat") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let chatId = o["chatId"] as? String else { return }
            let title = (o["title"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            self.pushAfter(0.35) { [weak self] in
                guard let self else { return nil }
                var reply: [String: Any] = ["t": "notesRenameChat", "project": project,
                                            "chatId": chatId]
                guard let index = self.chatIndex(project, chatId: chatId) else {
                    reply["ok"] = false
                    reply["error"] = "That chat is no longer on your Mac."
                    return reply
                }
                if !title.isEmpty { self.world.noteChats[project]?[index].title = title }
                reply["ok"] = true
                return reply
            }
        }

        register("notesDeleteChat") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let chatId = o["chatId"] as? String else { return }
            self.pushAfter(0.4) { [weak self] in
                guard let self else { return nil }
                self.world.noteChats[project]?.removeAll { $0.id == chatId }
                self.world.noteMessages[project]?.removeAll { $0.chatId == chatId }
                self.sweepNoteBlobs()
                return ["t": "notesDeleteChat", "project": project, "chatId": chatId, "ok": true]
            }
        }

        register("notesMessages") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let chatId = o["chatId"] as? String else { return }
            let limit = (o["limit"] as? NSNumber)?.intValue ?? 50
            let beforeId = o["beforeId"] as? String ?? ""
            self.pushAfter(beforeId.isEmpty ? 0.35 : 0.5) { [weak self] in
                guard let self else { return nil }
                let page = self.notePage(project, chatId: chatId, limit: limit, beforeId: beforeId)
                return ["t": "notesMessages", "project": project, "chatId": chatId,
                        "beforeId": beforeId, "ok": true, "messages": page.map(self.noteDict)]
            }
        }

        register("notesAddMessage") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let chatId = o["chatId"] as? String else { return }
            let text = o["text"] as? String ?? ""
            let drafts = o["attachments"] as? [[String: Any]] ?? []
            self.pushAfter(drafts.isEmpty ? 0.5 : 0.9) { [weak self] in
                guard let self else { return nil }
                var reply: [String: Any] = ["t": "notesAddMessage", "project": project,
                                            "chatId": chatId]
                switch self.addNote(project, chatId: chatId, text: text, drafts: drafts) {
                case .success(let note):
                    reply["ok"] = true
                    reply["message"] = self.noteDict(note)
                case .failure(let message):
                    reply["ok"] = false
                    reply["error"] = message
                }
                return reply
            }
        }

        register("notesEditMessage") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let id = o["id"] as? String else { return }
            let text = o["text"] as? String ?? ""
            self.pushAfter(0.4) { [weak self] in
                guard let self else { return nil }
                var reply: [String: Any] = ["t": "notesEditMessage", "project": project, "id": id]
                guard let index = self.world.noteMessages[project]?
                    .firstIndex(where: { $0.id == id }) else {
                    reply["ok"] = false
                    reply["error"] = "That note is no longer on your Mac."
                    return reply
                }
                self.world.noteMessages[project]?[index].text = text
                self.world.noteMessages[project]?[index].editedAt = self.nowMillis()
                reply["ok"] = true
                return reply
            }
        }

        register("notesDeleteMessage") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let id = o["id"] as? String else { return }
            self.pushAfter(0.35) { [weak self] in
                guard let self else { return nil }
                self.world.noteMessages[project]?.removeAll { $0.id == id }
                self.sweepNoteBlobs()
                return ["t": "notesDeleteMessage", "project": project, "id": id, "ok": true]
            }
        }

        register("notesSearch") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let query = o["query"] as? String else { return }
            let limit = (o["limit"] as? NSNumber)?.intValue ?? 50
            self.pushAfter(0.35) { [weak self] in
                guard let self else { return nil }
                return ["t": "notesSearch", "project": project, "query": query, "ok": true,
                        "hits": self.noteHits(project, query: query, limit: limit)]
            }
        }

        register("notesAttachment") { [weak self] o in
            guard let self, let project = o["project"] as? String,
                  let hash = o["hash"] as? String else { return }
            self.pushAfter(0.5) { [weak self] in
                guard let self else { return nil }
                var reply: [String: Any] = ["t": "notesAttachment", "project": project, "hash": hash]
                guard let data = self.world.noteBlobs[hash] else {
                    reply["ok"] = false
                    reply["error"] = "That attachment is no longer on your Mac."
                    return reply
                }
                reply["ok"] = true
                reply["data"] = data
                return reply
            }
        }
    }

    // MARK: state

    private enum AddNoteResult {
        case success(DemoWorld.NoteRec)
        case failure(String)
    }

    /// A project with no notebook gets one on first open, back-filled with a
    /// General chat, exactly as the Mac does.
    private func ensureNotebook(_ project: String) {
        guard world.noteChats[project] == nil else { return }
        world.noteChats[project] = []
        _ = newChat(project, title: "General")
    }

    private func newChat(_ project: String, title: String) -> DemoWorld.NoteChatRec {
        let now = nowMillis()
        world.noteSeq += 1
        let chat = DemoWorld.NoteChatRec(id: "chat-\(world.noteSeq)", title: title,
                                         createdAt: now, updatedAt: now)
        world.noteChats[project, default: []].insert(chat, at: 0)
        return chat
    }

    private func sortedChats(_ project: String) -> [DemoWorld.NoteChatRec] {
        (world.noteChats[project] ?? []).sorted { $0.updatedAt > $1.updatedAt }
    }

    private func chatIndex(_ project: String, chatId: String) -> Int? {
        world.noteChats[project]?.firstIndex { $0.id == chatId }
    }

    /// One page, newest first. `beforeId` is the oldest note the phone holds, so a
    /// page is everything below its seq.
    private func notePage(_ project: String, chatId: String, limit: Int,
                          beforeId: String) -> [DemoWorld.NoteRec] {
        let all = (world.noteMessages[project] ?? [])
            .filter { $0.chatId == chatId }
            .sorted { $0.seq > $1.seq }
        guard !beforeId.isEmpty else { return Array(all.prefix(max(limit, 1))) }
        guard let before = all.first(where: { $0.id == beforeId }) else { return [] }
        return Array(all.filter { $0.seq < before.seq }.prefix(max(limit, 1)))
    }

    private func addNote(_ project: String, chatId: String, text: String,
                         drafts: [[String: Any]]) -> AddNoteResult {
        guard let index = chatIndex(project, chatId: chatId) else {
            return .failure("That chat is no longer on your Mac.")
        }
        var attachments: [DemoWorld.NoteAttachmentRec] = []
        for draft in drafts {
            let encoded = draft["data"] as? String ?? ""
            guard !noteEncodedOverCap(encoded) else {
                return .failure("That file is too large to send from your phone. Add it from your Mac instead.")
            }
            guard let bytes = Data(base64Encoded: encoded) else {
                return .failure("That attachment could not be read. Try sending it again.")
            }
            let hash = noteHash(bytes)
            world.noteBlobs[hash] = encoded
            attachments.append(DemoWorld.NoteAttachmentRec(
                hash: hash, name: draft["name"] as? String ?? "attachment",
                size: bytes.count, mimeType: draft["mimeType"] as? String ?? "application/octet-stream"))
        }
        let now = nowMillis()
        world.noteSeq += 1
        let note = DemoWorld.NoteRec(id: "note-\(world.noteSeq)", chatId: chatId,
                                     seq: world.noteSeq, ts: now, text: text,
                                     attachments: attachments)
        world.noteMessages[project, default: []].append(note)
        world.noteChats[project]?[index].updatedAt = now
        return .success(note)
    }

    private func noteHits(_ project: String, query: String, limit: Int) -> [[String: Any]] {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !term.isEmpty else { return [] }
        let titles = Dictionary(uniqueKeysWithValues: (world.noteChats[project] ?? []).map { ($0.id, $0.title) })
        return (world.noteMessages[project] ?? [])
            .filter { $0.text.range(of: term, options: .caseInsensitive) != nil }
            // Newest first across every chat, so this orders on the timestamp
            // rather than the per-chat paging seq.
            .sorted { $0.ts == $1.ts ? $0.seq > $1.seq : $0.ts > $1.ts }
            .prefix(max(limit, 1))
            .map { note -> [String: Any] in
                ["id": note.id, "chatId": note.chatId,
                 "chatTitle": titles[note.chatId] ?? "",
                 "ts": note.ts, "snippet": noteSnippet(note.text, term: term)]
            }
    }

    /// Drop the bytes of attachments no note references any more, the way a chat
    /// delete sweeps orphaned blobs on the Mac.
    private func sweepNoteBlobs() {
        let live = Set(world.noteMessages.values.flatMap { $0 }.flatMap { $0.attachments.map(\.hash) })
        world.noteBlobs = world.noteBlobs.filter { live.contains($0.key) }
    }

    private func nowMillis() -> Int { Int(Date().timeIntervalSince1970 * 1000) }

    // MARK: wire builders

    private func noteChatDict(_ chat: DemoWorld.NoteChatRec) -> [String: Any] {
        ["id": chat.id, "title": chat.title,
         "createdAt": chat.createdAt, "updatedAt": chat.updatedAt]
    }

    private func noteDict(_ note: DemoWorld.NoteRec) -> [String: Any] {
        var o: [String: Any] = ["id": note.id, "chatId": note.chatId,
                                "ts": note.ts, "text": note.text]
        if let editedAt = note.editedAt { o["editedAt"] = editedAt }
        if !note.attachments.isEmpty {
            o["attachments"] = note.attachments.map {
                ["hash": $0.hash, "name": $0.name, "size": $0.size,
                 "mimeType": $0.mimeType] as [String: Any]
            }
        }
        return o
    }

    // MARK: fixtures

    private func seedNotesFixtures() {
        seedNoteChat("storefront", title: "Checkout redesign", texts: demoCheckoutNotes,
                     fromMinutesAgo: 15_800, toMinutesAgo: 22, attachmentAt: 34)
        seedNoteChat("storefront", title: "Ideas", texts: demoIdeaNotes,
                     fromMinutesAgo: 20_000, toMinutesAgo: 2_600)
        seedNoteChat("storefront", title: "General", texts: demoStorefrontGeneralNotes,
                     fromMinutesAgo: 26_000, toMinutesAgo: 8_400)
        seedNoteChat("api-gateway", title: "General", texts: demoGatewayNotes,
                     fromMinutesAgo: 30_000, toMinutesAgo: 5_100)
        seedNoteChat("mobile-app", title: "General", texts: demoMobileNotes,
                     fromMinutesAgo: 24_000, toMinutesAgo: 9_600)
    }

    /// Seed one chat with its notes spread evenly across a window, oldest first.
    /// `attachmentAt` indexes `texts` and gets the generated image.
    private func seedNoteChat(_ project: String, title: String, texts: [String],
                              fromMinutesAgo: Int, toMinutesAgo: Int, attachmentAt: Int? = nil) {
        if world.noteChats[project] == nil { world.noteChats[project] = [] }
        let chat = newChat(project, title: title)
        let span = Double(fromMinutesAgo - toMinutesAgo)
        let step = span / Double(max(texts.count - 1, 1))
        var notes: [DemoWorld.NoteRec] = []
        for (i, text) in texts.enumerated() {
            // A deterministic wobble so the thread doesn't read as machine-spaced.
            let minutesAgo = Double(fromMinutesAgo) - step * Double(i) - Double((i * 37) % 13)
            world.noteSeq += 1
            notes.append(DemoWorld.NoteRec(
                id: "note-\(world.noteSeq)", chatId: chat.id, seq: world.noteSeq,
                ts: nowMillis() - Int(max(minutesAgo, 1) * 60_000), text: text,
                attachments: i == attachmentAt ? [seedNoteImage()] : []))
        }
        world.noteMessages[project, default: []].append(contentsOf: notes)
        if let last = notes.last, let index = chatIndex(project, chatId: chat.id) {
            world.noteChats[project]?[index].updatedAt = last.ts
            world.noteChats[project]?[index].createdAt = notes[0].ts
        }
    }

    /// Store the generated mock screenshot and describe it the way a real
    /// attachment is described.
    private func seedNoteImage() -> DemoWorld.NoteAttachmentRec {
        let bytes = demoSummaryCardPNG()
        let hash = noteHash(bytes)
        world.noteBlobs[hash] = bytes.base64EncodedString()
        return DemoWorld.NoteAttachmentRec(hash: hash, name: "summary-card.png",
                                           size: bytes.count, mimeType: "image/png")
    }
}

// MARK: - helpers

private func noteHash(_ bytes: Data) -> String {
    SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
}

/// The per-file ceiling the Mac enforces on this link. Base64 emits four
/// characters per three bytes, so the encoded length is what the cap is measured
/// against — the same bound, derived in the same direction, as the real hub's.
private let demoAttachmentByteLimit = 8 * 1024 * 1024

private func noteEncodedOverCap(_ encoded: String) -> Bool {
    encoded.count > (demoAttachmentByteLimit + 2) / 3 * 4
}

/// A window around the match, matching the Mac's 80-before / 160-after budget.
private func noteSnippet(_ text: String, term: String) -> String {
    let before = 80, after = 160
    guard let match = text.range(of: term, options: .caseInsensitive) else {
        return text.count <= before + after ? text : String(text.prefix(before + after)) + "…"
    }
    let start = text.index(match.lowerBound, offsetBy: -before, limitedBy: text.startIndex)
        ?? text.startIndex
    let end = text.index(match.upperBound, offsetBy: after, limitedBy: text.endIndex) ?? text.endIndex
    return (start > text.startIndex ? "…" : "") + String(text[start..<end])
        + (end < text.endIndex ? "…" : "")
}

/// The attached "screenshot": a checkout summary card drawn in process, so the
/// demo ships an image without carrying one as a literal.
private func demoSummaryCardPNG() -> Data {
    let size = CGSize(width: 420, height: 300)
    let image = UIGraphicsImageRenderer(size: size).image { _ in
        UIColor(white: 0.94, alpha: 1).setFill()
        UIBezierPath(rect: CGRect(origin: .zero, size: size)).fill()

        UIColor.white.setFill()
        UIBezierPath(roundedRect: CGRect(x: 20, y: 20, width: 380, height: 260),
                     cornerRadius: 18).fill()

        let ink = UIColor(white: 0.11, alpha: 1)
        let muted = UIColor(white: 0.42, alpha: 1)
        drawDemoText("Order summary", at: CGPoint(x: 44, y: 44), size: 17, weight: .semibold, color: ink)

        var y: CGFloat = 84
        for (label, price) in [("Merino crew — M", "$28.00"), ("Canvas tote", "$18.00"),
                               ("Shipping", "$4.00")] {
            drawDemoText(label, at: CGPoint(x: 44, y: y), size: 14, weight: .regular, color: muted)
            drawDemoText(price, at: CGPoint(x: 316, y: y), size: 14, weight: .regular, color: muted)
            y += 30
        }

        UIColor(white: 0.88, alpha: 1).setFill()
        UIBezierPath(rect: CGRect(x: 44, y: y + 8, width: 332, height: 1)).fill()

        drawDemoText("Total", at: CGPoint(x: 44, y: y + 24), size: 16, weight: .semibold, color: ink)
        drawDemoText("$50.00", at: CGPoint(x: 308, y: y + 24), size: 16, weight: .semibold, color: ink)

        UIColor(red: 0.16, green: 0.42, blue: 0.94, alpha: 1).setFill()
        UIBezierPath(roundedRect: CGRect(x: 44, y: y + 62, width: 332, height: 44),
                     cornerRadius: 12).fill()
        drawDemoText("Pay $50.00", at: CGPoint(x: 168, y: y + 75), size: 15, weight: .semibold,
                     color: .white)
    }
    return image.pngData() ?? Data()
}

private func drawDemoText(_ text: String, at point: CGPoint, size: CGFloat,
                          weight: UIFont.Weight, color: UIColor) {
    NSAttributedString(string: text, attributes: [
        .font: UIFont.systemFont(ofSize: size, weight: weight),
        .foregroundColor: color,
    ]).draw(at: point)
}

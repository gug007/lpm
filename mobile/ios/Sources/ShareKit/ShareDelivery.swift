import Foundation

/// Hands a share to its Mac over one short link: for an agent, the images first
/// (the Mac saves each and answers its path), then a new tab whose first prompt
/// is the note, the shared text and those paths; for notes, one message in the
/// project's most recent chat with the images attached.
enum ShareDelivery {
    enum Outcome: Equatable {
        case sent
        /// No address answered: keep the share for the app to send later.
        case unreachable
        case failed(String)
    }

    static func send(_ share: PendingShare, images: [Data], to mac: ShareDirectory.Mac, phoneId: String,
                     route: @escaping ShareMacLink.Route = { ($0, $1) }) async -> Outcome {
        guard let localId = UUID(uuidString: mac.localId), let credential = Keychain.load(for: localId) else {
            return .failed("Pair lpm Link with \(mac.name) again to share to it.")
        }
        let link: ShareMacLink
        do {
            link = try await ShareMacLink.open(hosts: mac.hosts, port: mac.port, credential: credential,
                                            pin: Keychain.loadPin(for: localId), phoneId: phoneId, route: route)
        } catch ShareMacLink.Failure.refused {
            return .failed("\(mac.name) turned this phone away. Pair lpm Link with it again to share to it.")
        } catch {
            return .unreachable
        }
        defer { link.close() }
        do {
            switch share.destination {
            case .agent: try await startAgent(share, images: images, on: link)
            case .notes: try await addNote(share, images: images, on: link)
            }
            return .sent
        } catch ShareMacLink.Failure.refused(let error) {
            return .failed(error)
        } catch {
            return .unreachable
        }
    }

    private static func startAgent(_ share: PendingShare, images: [Data], on link: ShareMacLink) async throws {
        var paths: [String] = []
        for (index, image) in images.enumerated() {
            let reqId = UUID().uuidString
            try await link.send(["t": "upload", "id": "share", "data": image.base64EncodedString(),
                                 "mime": "image/jpeg", "name": "shared-\(index + 1).jpg", "reqId": reqId])
            let reply = try await link.reply { $0["t"] as? String == "upload" && $0["reqId"] as? String == reqId }
            guard reply["ok"] as? Bool == true, let path = reply["path"] as? String else {
                throw ShareMacLink.Failure.refused(reply["error"] as? String ?? "Couldn't send the image.")
            }
            paths.append(path)
        }
        try await link.send(["t": "newTerminal", "project": share.project, "agent": share.agent,
                             "prompt": share.prompt(imagePaths: paths)])
        let reply = try await link.reply { $0["t"] as? String == "newTerminal" }
        guard reply["ok"] as? Bool == true else {
            throw ShareMacLink.Failure.refused(reply["error"] as? String ?? "Couldn't open a new tab.")
        }
    }

    private static func addNote(_ share: PendingShare, images: [Data], on link: ShareMacLink) async throws {
        try await link.send(["t": "notesChats", "project": share.project])
        let chats = try await link.reply {
            $0["t"] as? String == "notesChats" && $0["project"] as? String == share.project
        }
        guard chats["ok"] as? Bool == true,
              let chat = (chats["chats"] as? [[String: Any]])?.first?["id"] as? String else {
            throw ShareMacLink.Failure.refused(chats["error"] as? String ?? "Couldn't open the project's notes.")
        }
        // Images past the budget go as further notes after the first, which
        // carries the text.
        for (part, group) in noteGroups(Array(images.enumerated()), bytes: { $0.element.count }).enumerated() {
            let attachments = group.map { index, image in
                ["name": "shared-\(index + 1).jpg", "mimeType": "image/jpeg", "data": image.base64EncodedString()]
            }
            let reqId = UUID().uuidString
            try await link.send(["t": "notesAddMessage", "project": share.project, "chatId": chat,
                                 "text": part == 0 ? share.noteText : "", "attachments": attachments, "reqId": reqId])
            let reply = try await link.reply {
                $0["t"] as? String == "notesAddMessage" && $0["reqId"] as? String == reqId
            }
            guard reply["ok"] as? Bool == true else {
                throw ShareMacLink.Failure.refused(reply["error"] as? String ?? "Couldn't add the note.")
            }
        }
    }

    /// The Mac reads frames of up to 16 MiB and attachments ride as base64, a
    /// third bigger, so one note carries at most this many bytes of files.
    static let noteBudget = 10 * 1024 * 1024

    /// `items` in order, in groups whose `bytes` each fit one note; one empty
    /// group for none. One frame too big for the Mac drops the link, so what is
    /// past the budget goes as further notes.
    static func noteGroups<T>(_ items: [T], bytes: (T) -> Int) -> [[T]] {
        var groups: [[T]] = []
        var current: [T] = []
        var size = 0
        for item in items {
            let n = bytes(item)
            if !current.isEmpty, size + n > noteBudget {
                groups.append(current)
                current = []
                size = 0
            }
            current.append(item)
            size += n
        }
        groups.append(current)
        return groups
    }
}

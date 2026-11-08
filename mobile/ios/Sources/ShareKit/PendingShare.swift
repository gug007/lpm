import Foundation

/// One share on its way to a Mac: what was shared, the note it came with, and
/// where it goes: a new agent tab whose first prompt it is, or the project's notes.
struct PendingShare: Codable, Identifiable, Equatable {
    enum Destination: String, Codable, CaseIterable {
        case agent, notes
    }

    var id = UUID().uuidString
    let serverId: String
    let macName: String
    let project: String
    let projectTitle: String
    let destination: Destination
    /// The agent a new tab starts, for `.agent`.
    let agent: String
    let note: String
    /// The shared text and links, a paragraph each.
    let text: String
    var createdAt = Date()

    /// What the agent is asked, with the shared images' paths on the Mac after it.
    func prompt(imagePaths: [String]) -> String {
        Self.paragraphs([note, text, imagePaths.joined(separator: " ")])
    }

    /// The note's text in the project's notebook; images ride as attachments.
    var noteText: String { Self.paragraphs([note, text]) }

    static func paragraphs(_ parts: [String]) -> String {
        parts.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: "\n\n")
    }
}

/// Shares the extension couldn't deliver, kept in the app group with their images
/// until the app reaches the Mac: a folder per share.
enum ShareInbox {
    private static let appGroup = "group.cx.lpm.mobile"

    private static var root: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
            .appendingPathComponent("share-inbox", isDirectory: true)
    }

    static func save(_ share: PendingShare, images: [Data]) throws {
        guard let root else { throw CocoaError(.fileNoSuchFile) }
        let folder = root.appendingPathComponent(share.id, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        for (index, image) in images.enumerated() {
            try image.write(to: folder.appendingPathComponent("image-\(index).jpg"), options: .atomic)
        }
        try JSONEncoder().encode(share).write(to: folder.appendingPathComponent("share.json"), options: .atomic)
    }

    /// Every waiting share, oldest first.
    static func all() -> [PendingShare] {
        guard let root, let folders = try? FileManager.default.contentsOfDirectory(
            at: root, includingPropertiesForKeys: nil) else { return [] }
        return folders.compactMap { folder in
            guard let data = try? Data(contentsOf: folder.appendingPathComponent("share.json")) else { return nil }
            return try? JSONDecoder().decode(PendingShare.self, from: data)
        }
        .sorted { $0.createdAt < $1.createdAt }
    }

    static func images(of share: PendingShare) -> [Data] {
        guard let folder = root?.appendingPathComponent(share.id, isDirectory: true) else { return [] }
        var images: [Data] = []
        while let data = try? Data(contentsOf: folder.appendingPathComponent("image-\(images.count).jpg")) {
            images.append(data)
        }
        return images
    }

    static func remove(_ share: PendingShare) {
        guard let folder = root?.appendingPathComponent(share.id, isDirectory: true) else { return }
        try? FileManager.default.removeItem(at: folder)
    }
}

import Foundation

/// What a finished turn's expanded notification shows besides its title: the
/// agent's whole answer and the files the turn left changed (PROTOCOL.md, a
/// `Done` alert's `answer` and `files`). The service extension copies them from
/// the push into the notification's `userInfo`; the content extension reads
/// them back.
struct AgentAnswerContent {
    struct File: Equatable {
        let path: String
        let added: Int
        let removed: Int

        var name: String { (path as NSString).lastPathComponent }
        var directory: String { (path as NSString).deletingLastPathComponent }
    }

    let answer: String
    let files: [File]
    /// How many changed files the list leaves out.
    let moreFiles: Int

    init(userInfo: [AnyHashable: Any]) {
        answer = userInfo[Key.answer] as? String ?? ""
        files = Self.files(userInfo[Key.files])
        moreFiles = max(0, (userInfo[Key.changedFiles] as? Int ?? files.count) - files.count)
    }

    static func carry(_ payload: [String: Any], into info: inout [AnyHashable: Any]) {
        if let answer = payload["answer"] as? String, !answer.isEmpty {
            info[Key.answer] = answer
        }
        let files = files(payload["files"])
        guard !files.isEmpty else { return }
        info[Key.files] = files.map { ["path": $0.path, "added": $0.added, "removed": $0.removed] }
        let changes = payload["changes"] as? [String: Any]
        info[Key.changedFiles] = changes?["files"] as? Int ?? files.count
    }

    private static func files(_ value: Any?) -> [File] {
        (value as? [[String: Any]] ?? []).compactMap { entry in
            guard let path = entry["path"] as? String, !path.isEmpty else { return nil }
            return File(path: path, added: entry["added"] as? Int ?? 0, removed: entry["removed"] as? Int ?? 0)
        }
    }

    private enum Key {
        static let answer = "answer"
        static let files = "files"
        static let changedFiles = "changedFiles"
    }
}

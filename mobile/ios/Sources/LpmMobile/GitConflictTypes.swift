import Foundation

/// One file of a merge that stopped on conflicts.
struct GitConflictFile: Identifiable, Equatable {
    let path: String
    /// Conflicts left in the file.
    let conflicts: Int
    /// The line the first of them is on, 0 when none is left.
    let firstLine: Int
    let resolved: Bool

    var id: String { path }

    init(_ o: [String: Any]) {
        path = o["path"] as? String ?? ""
        conflicts = o["conflicts"] as? Int ?? 0
        firstLine = o["firstLine"] as? Int ?? 0
        resolved = o["resolved"] as? Bool ?? false
    }

    /// How the file stands, as the desktop's row says it. `side` is the one it was
    /// resolved with from here.
    func label(side: GitConflictSide?) -> String {
        if resolved { return side.map { "resolved · used \($0.rawValue)" } ?? "resolved" }
        if conflicts == 0 { return "no markers left" }
        return "\(conflicts) conflict\(conflicts == 1 ? "" : "s")"
    }
}

/// Whose version of a file to keep: this branch's or the incoming one's.
enum GitConflictSide: String {
    case ours, theirs
}

/// What a merge, a pull or a rebase left to work through (`git`'s `merge`).
struct GitMergeState: Equatable {
    /// A merge is in progress, so it can be continued or aborted; a rebase's or a
    /// stash's conflicts can only be worked through.
    let merging: Bool
    let source: String
    let files: [GitConflictFile]
    /// What the AI working through them is doing; nil when none is.
    let resolving: String?

    init?(_ value: Any?) {
        guard let o = value as? [String: Any] else { return nil }
        merging = o["merging"] as? Bool ?? false
        source = o["source"] as? String ?? ""
        files = (o["files"] as? [[String: Any]] ?? []).map(GitConflictFile.init)
        resolving = (o["resolving"] as? [String: Any]).map { $0["line"] as? String ?? "" }
        if files.isEmpty { return nil }
    }

    var remaining: Int { files.filter { !$0.resolved }.count }

    var progress: String {
        "\(files.count - remaining) of \(files.count) file\(files.count == 1 ? "" : "s") resolved"
    }

    func title(into branch: String) -> String {
        if source.isEmpty { return "Merge conflicts" }
        return branch.isEmpty ? "Merging \(source)" : "Merging \(source) into \(branch)"
    }
}

/// A step of an AI run on a project's conflicts, whoever started it.
struct GitMergeRun {
    let project: String
    let running: Bool
    let line: String
    /// Ended without failing: the files that still have conflicts.
    let left: Int?
    /// Ended: a merge is left to commit.
    let merging: Bool
    let error: String?

    init(_ o: [String: Any]) {
        project = o["project"] as? String ?? ""
        running = o["running"] as? Bool ?? false
        line = o["line"] as? String ?? ""
        left = o["left"] as? Int
        merging = o["merging"] as? Bool ?? false
        error = o["error"] as? String
    }
}

/// What the phone asked the Mac to do about a project's conflicts.
enum GitConflictOp: Equatable {
    case resolve, stop, abort
    /// Commits the merge of this source.
    case commit(String)
    case take(path: String, side: GitConflictSide)
    case markResolved(path: String)

    /// The file it's about, when it's one.
    var path: String? {
        switch self {
        case .take(let path, _), .markResolved(let path): path
        default: nil
        }
    }

    /// The request it sends, which its reply is named by.
    var verb: String {
        switch self {
        case .resolve: "gitMergeResolve"
        case .stop: "gitMergeStop"
        case .abort: "gitMergeAbort"
        case .commit: "gitMergeContinue"
        case .take: "gitConflictTake"
        case .markResolved: "gitConflictResolved"
        }
    }

    /// What the alert says when the Mac refuses it.
    var failure: String {
        switch self {
        case .resolve: "Couldn't resolve the conflicts"
        case .stop: "Couldn't stop"
        case .abort: "Couldn't abort the merge"
        case .commit: "Couldn't continue the merge"
        case .take(_, let side): "Couldn't use \(side.rawValue)"
        case .markResolved: "Couldn't mark it resolved"
        }
    }

    /// A merge commit runs the project's hooks; the rest are quick.
    var seconds: Double {
        if case .commit = self { return 120 }
        return 30
    }
}

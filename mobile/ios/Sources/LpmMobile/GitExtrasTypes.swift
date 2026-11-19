import Foundation

/// What the Mac's look for secrets found in a line a commit adds (`gitScanSecrets`).
struct SecretFinding: Identifiable, Hashable {
    let path: String
    /// 1-based line in the new file; 0 for a finding about the whole file.
    let line: Int
    /// What it looks like: "Stripe secret key", "Environment file".
    let rule: String
    /// Only the key's kind and last characters: sk_live_••••Qx.
    let masked: String

    var id: String { "\(path)\u{0}\(line)\u{0}\(rule)" }
    /// "lib/stripe.ts:12", or the path alone for a whole-file finding.
    var place: String { line > 0 ? "\(path):\(line)" : path }

    init(path: String, line: Int, rule: String, masked: String) {
        self.path = path
        self.line = line
        self.rule = rule
        self.masked = masked
    }

    init?(_ o: [String: Any]) {
        guard let path = o["path"] as? String, !path.isEmpty else { return nil }
        self.init(path: path, line: o["line"] as? Int ?? 0, rule: o["rule"] as? String ?? "",
                  masked: o["masked"] as? String ?? "")
    }
}

struct SecretScanReply {
    let project: String
    let findings: [SecretFinding]
    let error: String?

    init(_ o: [String: Any]) {
        project = o["project"] as? String ?? ""
        let ok = o["ok"] as? Bool ?? false
        findings = ok ? (o["findings"] as? [[String: Any]] ?? []).compactMap(SecretFinding.init) : []
        error = ok ? nil : (o["error"] as? String ?? "Couldn't check the commit for secrets.")
    }
}

/// The branch's own changes since it left its base (`gitBranchFiles`).
struct BranchScope: Equatable {
    enum Range: String { case since, unpushed }

    let base: String
    let range: Range
    let commits: Int
    let files: [GitFile]

    /// "3 commits since main", "2 commits not pushed".
    var heading: String {
        let count = commits == 1 ? "1 commit" : "\(commits) commits"
        return range == .since ? "\(count) since \(base)" : "\(count) not pushed"
    }

    static func == (a: BranchScope, b: BranchScope) -> Bool {
        a.base == b.base && a.range == b.range && a.commits == b.commits && a.files.map(\.path) == b.files.map(\.path)
    }
}

struct BranchFilesReply {
    let project: String
    /// nil when there's nothing to compare with.
    let scope: BranchScope?
    let error: String?

    init(_ o: [String: Any]) {
        project = o["project"] as? String ?? ""
        let ok = o["ok"] as? Bool ?? false
        error = ok ? nil : (o["error"] as? String ?? "Couldn't read the branch.")
        let base = o["base"] as? String ?? ""
        scope = ok && !base.isEmpty
            ? BranchScope(base: base, range: BranchScope.Range(rawValue: o["range"] as? String ?? "") ?? .since,
                          commits: o["commits"] as? Int ?? 0,
                          files: (o["files"] as? [[String: Any]] ?? []).map(GitFile.init))
            : nil
    }
}

/// The review on a branch's pull request (`gitPrDiscussion`).
struct PrDiscussion: Equatable {
    struct Note: Equatable, Identifiable {
        enum Kind: String { case review, line, comment }
        let kind: Kind
        let author: String
        let body: String
        let state: String
        let path: String
        let line: Int?
        let createdAt: String

        var id: String { "\(kind.rawValue)\u{0}\(author)\u{0}\(createdAt)\u{0}\(path)\u{0}\(body.prefix(40))" }

        /// "requested changes", "approved"; nil for anything but a review.
        var verdict: String? {
            guard kind == .review else { return nil }
            switch state {
            case "APPROVED": return "approved"
            case "CHANGES_REQUESTED": return "requested changes"
            case "COMMENTED": return "commented"
            case "DISMISSED": return "dismissed"
            default: return state.isEmpty ? nil : state.lowercased()
            }
        }

        /// "lib/payments.ts:18" for a line comment.
        var place: String? {
            guard kind == .line, !path.isEmpty else { return nil }
            return line.map { "\(path):\($0)" } ?? path
        }

        init?(_ o: [String: Any]) {
            guard let kind = Kind(rawValue: o["kind"] as? String ?? "") else { return nil }
            self.kind = kind
            author = o["author"] as? String ?? ""
            body = o["body"] as? String ?? ""
            state = o["state"] as? String ?? ""
            path = o["path"] as? String ?? ""
            line = o["line"] as? Int
            createdAt = o["createdAt"] as? String ?? ""
        }
    }

    let number: Int
    let title: String
    let url: String
    let notes: [Note]
    /// What an agent is told to address it.
    let prompt: String

    /// Everything a reviewer wrote, a bare approval left out.
    var comments: [Note] { notes.filter { !$0.body.isEmpty || $0.state == "CHANGES_REQUESTED" } }

    /// The newest verdict each reviewer gave, changes requested first.
    var changesRequested: Bool {
        var latest: [String: String] = [:]
        for note in notes where note.kind == .review && note.state != "COMMENTED" {
            latest[note.author] = note.state
        }
        return latest.values.contains("CHANGES_REQUESTED")
    }

    init?(_ o: [String: Any], prompt: String) {
        guard let number = o["number"] as? Int else { return nil }
        self.number = number
        title = o["title"] as? String ?? ""
        url = o["url"] as? String ?? ""
        notes = (o["notes"] as? [[String: Any]] ?? []).compactMap(Note.init)
        self.prompt = prompt
    }
}

struct PrDiscussionReply {
    let project: String
    let discussion: PrDiscussion?
    let error: String?

    init(_ o: [String: Any]) {
        project = o["project"] as? String ?? ""
        let ok = o["ok"] as? Bool ?? false
        error = ok ? nil : (o["error"] as? String ?? "Couldn't read the pull request.")
        discussion = ok ? (o["discussion"] as? [String: Any]).flatMap {
            PrDiscussion($0, prompt: o["prompt"] as? String ?? "")
        } : nil
    }
}

/// The end of a failed check's log (`gitCheckLog`).
struct CheckLog: Equatable {
    let step: String
    let lines: [String]
    let more: Bool
}

struct CheckLogReply {
    let project: String
    let url: String
    let log: CheckLog?
    let error: String?

    init(_ o: [String: Any]) {
        project = o["project"] as? String ?? ""
        url = o["url"] as? String ?? ""
        let ok = o["ok"] as? Bool ?? false
        log = ok ? CheckLog(step: o["step"] as? String ?? "", lines: o["lines"] as? [String] ?? [],
                            more: o["more"] as? Bool ?? false) : nil
        error = ok ? nil : (o["error"] as? String ?? "Couldn't read the log.")
    }
}

/// How a save from the file preview went (`writeFile`).
struct FileWriteReply {
    let reqId: String
    let sha256: String?
    /// The file changed on the Mac since it was opened, so nothing was written.
    let changed: Bool
    let error: String?

    init(_ o: [String: Any]) {
        reqId = o["reqId"] as? String ?? ""
        let ok = o["ok"] as? Bool ?? false
        sha256 = ok ? o["sha256"] as? String : nil
        changed = o["changed"] as? Bool ?? false
        error = ok ? nil : (o["error"] as? String ?? "Couldn't save the file.")
    }
}

extension Wire {
    static func gitScanSecrets(project: String, files: [String]) -> String {
        json(["t": "gitScanSecrets", "project": project, "files": files])
    }
    static func gitBranchFiles(project: String) -> String { json(["t": "gitBranchFiles", "project": project]) }
    static func gitBranchDiffs(project: String, paths: [String]) -> String {
        json(["t": "gitBranchDiffs", "project": project, "paths": paths])
    }
    static func gitPrDiscussion(project: String) -> String { json(["t": "gitPrDiscussion", "project": project]) }
    static func gitCheckLog(project: String, url: String) -> String {
        json(["t": "gitCheckLog", "project": project, "url": url])
    }
    static func writeFile(project: String, path: String, content: String, base: String, reqId: String) -> String {
        json(["t": "writeFile", "project": project, "path": path, "content": content, "base": base, "reqId": reqId])
    }
}

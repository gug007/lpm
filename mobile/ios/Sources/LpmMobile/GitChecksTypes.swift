import Foundation

/// One CI check, as the desktop footer's checks menu lists it.
struct CiCheck: Equatable, Identifiable {
    enum State: String {
        case fail, pending, pass, skipped

        var order: Int {
            switch self {
            case .fail: 0
            case .pending: 1
            case .pass: 2
            case .skipped: 3
            }
        }
    }

    let name: String
    let workflow: String
    let state: State
    let url: String
    /// The earlier push this result is from, when the branch's newest didn't run it.
    let commit: String?

    var id: String { "\(workflow)/\(name)" }

    /// How each recent commit did by itself (`gitCommitChecks`), by full hash.
    static func commitStates(_ commits: [[String: Any]]) -> [String: State] {
        var states: [String: State] = [:]
        for commit in commits {
            guard let sha = commit["sha"] as? String,
                  let state = State(rawValue: commit["state"] as? String ?? "") else { continue }
            states[sha] = state
        }
        return states
    }

    /// "Linux host · on fcb454f": what the menu shows after the name.
    var detail: String {
        [workflow, commit.map { "on \($0)" } ?? ""].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    var runId: String? {
        guard let range = url.range(of: "/actions/runs/") else { return nil }
        let id = url[range.upperBound...].prefix { $0.isNumber }
        return id.isEmpty ? nil : String(id)
    }

    init?(_ o: [String: Any]) {
        guard let name = o["name"] as? String, !name.isEmpty else { return nil }
        self.name = name
        workflow = o["workflow"] as? String ?? ""
        state = State(rawValue: o["state"] as? String ?? "") ?? .pending
        url = o["url"] as? String ?? ""
        commit = (o["commit"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    }

    init(name: String, workflow: String, state: State, url: String, commit: String? = nil) {
        self.name = name
        self.workflow = workflow
        self.state = state
        self.url = url
        self.commit = commit
    }
}

/// How a project's branch stands on CI (`gitChecks`): its open pull request's
/// checks, else those of the commit it last pushed.
struct GitChecks: Equatable {
    struct PullRequest: Equatable {
        let number: Int
        let url: String
        let title: String
    }

    struct Commit: Equatable {
        let sha: String
        let title: String
        let url: String
        var short: String { String(sha.prefix(7)) }
    }

    let branch: String
    let pr: PullRequest?
    let commit: Commit?
    var checks: [CiCheck]
    let fixPrompt: String?

    init?(_ o: [String: Any]) {
        branch = o["branch"] as? String ?? ""
        fixPrompt = (o["fixPrompt"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        if let p = o["pr"] as? [String: Any], let number = p["number"] as? Int {
            pr = PullRequest(number: number, url: p["url"] as? String ?? "", title: p["title"] as? String ?? "")
            commit = nil
            checks = (p["checks"] as? [[String: Any]] ?? []).compactMap(CiCheck.init)
        } else if let c = o["commit"] as? [String: Any], let sha = c["sha"] as? String, !sha.isEmpty {
            pr = nil
            commit = Commit(sha: sha, title: c["title"] as? String ?? "", url: c["url"] as? String ?? "")
            checks = (c["checks"] as? [[String: Any]] ?? []).compactMap(CiCheck.init)
        } else {
            return nil
        }
    }

    init(branch: String, pr: PullRequest?, commit: Commit?, checks: [CiCheck], fixPrompt: String?) {
        self.branch = branch
        self.pr = pr
        self.commit = commit
        self.checks = checks
        self.fixPrompt = fixPrompt
    }

    private var counted: [CiCheck] { checks.filter { $0.state != .skipped } }
    var failed: Int { counted.filter { $0.state == .fail }.count }
    var pending: Int { counted.filter { $0.state == .pending }.count }

    /// How they stand together: failing, running or passed; nil when there's
    /// nothing to show (no checks, or only skipped ones).
    var verdict: CiCheck.State? {
        if counted.isEmpty { return nil }
        if failed > 0 { return .fail }
        return pending > 0 ? .pending : .pass
    }

    var label: String {
        switch verdict {
        case .fail: "\(failed) failing"
        case .pending: "\(pending) running"
        default: "Checks passed"
        }
    }

    /// Failing first, then running, passed and skipped; by name within each.
    var sorted: [CiCheck] {
        checks.sorted {
            $0.state.order != $1.state.order
                ? $0.state.order < $1.state.order
                : $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
        }
    }

    var failingRunIds: [String] {
        var ids: [String] = []
        for id in checks.filter({ $0.state == .fail }).compactMap(\.runId) where !ids.contains(id) {
            ids.append(id)
        }
        return ids
    }

    var heading: String {
        if let pr { return "Checks on #\(pr.number)" }
        return "Checks on \(branch) · \(commit?.short ?? "")"
    }

    var subheading: String? { pr?.title ?? commit?.title }

    var githubURL: URL? {
        let base = pr?.url ?? commit?.url ?? ""
        return base.isEmpty ? nil : URL(string: base + "/checks")
    }

    /// The failed jobs of `runIds` running again, until the Mac says how they went.
    func rerunning(_ runIds: [String]) -> GitChecks {
        var next = self
        next.checks = checks.map { check in
            guard check.state == .fail, let id = check.runId, runIds.contains(id) else { return check }
            return CiCheck(name: check.name, workflow: check.workflow, state: .pending, url: check.url,
                           commit: check.commit)
        }
        return next
    }

    /// "2 commits not pushed yet. These checks are for e8ddefe, the last one you pushed."
    func unpushedNote(ahead: Int) -> String? {
        guard pr == nil, ahead > 0, let commit else { return nil }
        let count = ahead == 1 ? "1 commit" : "\(ahead) commits"
        return "\(count) not pushed yet. These checks are for \(commit.short), the last one you pushed."
    }
}

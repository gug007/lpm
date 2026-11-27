import Foundation

/// The ways GitHub merges a pull request, in the order its merge button lists them.
enum GitMergeMethod: String, CaseIterable, Identifiable {
    case merge, squash, rebase

    var id: String { rawValue }

    var label: String {
        switch self {
        case .merge: "Create a merge commit"
        case .squash: "Squash and merge"
        case .rebase: "Rebase and merge"
        }
    }
}

/// What GitHub says about merging an open pull request (`merge` in `gitChecks`),
/// with the methods the repository allows.
struct GitMergeOffer: Equatable {
    let mergeable: String
    let state: String
    let review: String
    let head: String
    let methods: [GitMergeMethod]
    /// GitHub deletes the branch by itself once it's merged.
    let deletesBranch: Bool
    /// GitHub lets this person merge past the rules holding it back.
    let canBypass: Bool
    let base: String

    init(_ o: [String: Any]) {
        mergeable = o["mergeable"] as? String ?? ""
        state = o["state"] as? String ?? ""
        review = o["review"] as? String ?? ""
        head = o["head"] as? String ?? ""
        let methods = (o["methods"] as? [String] ?? []).compactMap(GitMergeMethod.init)
        self.methods = methods.isEmpty ? GitMergeMethod.allCases : methods
        deletesBranch = o["deletesBranch"] as? Bool ?? false
        canBypass = o["canBypass"] as? Bool ?? false
        base = o["base"] as? String ?? ""
    }

    /// The rules on the base branch hold it back, and this person may bypass them
    /// (the desktop's `mergeStatus` `bypass`).
    var bypassable: Bool { canBypass && (state == "BLOCKED" || state == "BEHIND") }

    var baseName: String { base.isEmpty ? "its base branch" : base }
}

/// The Mac's wait to merge a pull request once its checks pass (PROTOCOL.md,
/// MergeWatch), armed from here or at the desk.
struct GitMergeWatch: Equatable {
    let number: Int
    let title: String
    let method: GitMergeMethod
    let deleteBranch: Bool
    let bypass: Bool
    /// "waiting", then "merged", "stopped" or "cancelled".
    let state: String
    let reason: String?
    let deletedBranch: Bool

    init?(_ o: [String: Any]?) {
        guard let o, let number = o["number"] as? Int else { return nil }
        self.number = number
        title = o["title"] as? String ?? ""
        method = GitMergeMethod(rawValue: o["method"] as? String ?? "") ?? .squash
        deleteBranch = o["deleteBranch"] as? Bool ?? false
        bypass = o["bypass"] as? Bool ?? false
        state = o["state"] as? String ?? ""
        reason = (o["reason"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        deletedBranch = o["deletedBranch"] as? Bool ?? false
    }

    init(number: Int, title: String, method: GitMergeMethod, deleteBranch: Bool, bypass: Bool) {
        self.number = number
        self.title = title
        self.method = method
        self.deleteBranch = deleteBranch
        self.bypass = bypass
        state = "waiting"
        reason = nil
        deletedBranch = false
    }

    var waiting: Bool { state == "waiting" }

    /// What it will do, as the desktop's PR card says it (`armedText`).
    func armedText(base: String, site: String) -> String {
        let branch = deleteBranch ? ", then delete the branch on \(site)" : ""
        return "\(method.label) once the running checks pass\(bypassing(bypass, base))\(branch). Stops if a check fails."
    }
}

/// ", bypassing the rules on main if they still block it" when the merge bypasses them.
private func bypassing(_ bypass: Bool, _ base: String) -> String {
    bypass ? ", bypassing the rules on \(base) if they still block it" : ""
}

/// Whether the merge button can go, and what the sheet says when it can't.
enum GitMergeStatus: Equatable {
    case ready(String)
    /// GitHub is still working out whether it merges cleanly.
    case checking
    case waitingForChecks
    case blocked(String)
}

/// A pull request this phone just merged, shown until the sheet closes.
struct MergedPullRequest: Equatable, ForgeRef {
    let number: Int
    let title: String
    let deletedBranch: Bool
    var isGitLab = false
}

extension GitChecks {
    /// GitHub can't merge the open pull request because it conflicts with its base.
    var conflicts: Bool {
        guard let offer = pr?.merge else { return false }
        return offer.mergeable == "CONFLICTING" || offer.state == "DIRTY"
    }

    /// How the open pull request stands on merging; nil when there's none, or
    /// while its checks fail and the sheet's fixes come first.
    var mergeStatus: GitMergeStatus? {
        guard let pr, let offer = pr.merge else { return nil }
        if pr.isDraft || offer.state == "DRAFT" {
            return .blocked("Draft \(pr.noun)s can't be merged. Mark it ready for review on \(pr.site).")
        }
        switch verdict {
        case .fail: return nil
        case .pending: return .waitingForChecks
        default: break
        }
        if offer.mergeable == "CONFLICTING" || offer.state == "DIRTY" {
            return .blocked("This branch has conflicts with its base branch.")
        }
        switch offer.state {
        case "CLEAN", "HAS_HOOKS", "UNSTABLE":
            return .ready(readyDetail(offer))
        case "BEHIND":
            return .blocked("This branch is behind its base branch. Update it before merging.")
        case "BLOCKED":
            switch offer.review {
            case "CHANGES_REQUESTED": return .blocked("A reviewer asked for changes.")
            case "REVIEW_REQUIRED": return .blocked("A review is required before merging.")
            default: return .blocked("The base branch's rules don't allow merging yet.")
            }
        default:
            return .checking
        }
    }

    /// How many checks still run, for "lpm merges once the 3 running checks pass".
    var runningChecks: Int { checks.filter { $0.state == .pending }.count }

    /// What Merge When Checks Pass does (the desktop's `waitText`).
    func waitText(bypass: Bool) -> String {
        let running = runningChecks
        let checks = running == 1 ? "the running check passes" : "the \(running) running checks pass"
        let base = pr?.merge?.baseName ?? "its base branch"
        return "lpm merges once \(checks)\(bypassing(bypass, base))."
    }

    private func readyDetail(_ offer: GitMergeOffer) -> String {
        [
            verdict == .pass ? "All checks passed" : "No checks",
            offer.review == "APPROVED" ? "Approved" : "",
            "No conflicts",
        ].filter { !$0.isEmpty }.joined(separator: " · ")
    }
}

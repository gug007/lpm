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

    init(_ o: [String: Any]) {
        mergeable = o["mergeable"] as? String ?? ""
        state = o["state"] as? String ?? ""
        review = o["review"] as? String ?? ""
        head = o["head"] as? String ?? ""
        let methods = (o["methods"] as? [String] ?? []).compactMap(GitMergeMethod.init)
        self.methods = methods.isEmpty ? GitMergeMethod.allCases : methods
        deletesBranch = o["deletesBranch"] as? Bool ?? false
    }
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
struct MergedPullRequest: Equatable {
    let number: Int
    let title: String
    let deletedBranch: Bool
}

extension GitChecks {
    /// How the open pull request stands on merging; nil when there's none, or
    /// while its checks fail and the sheet's fixes come first.
    var mergeStatus: GitMergeStatus? {
        guard let pr, let offer = pr.merge else { return nil }
        if pr.isDraft || offer.state == "DRAFT" {
            return .blocked("Draft pull requests can't be merged. Mark it ready for review on GitHub.")
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

    private func readyDetail(_ offer: GitMergeOffer) -> String {
        [
            verdict == .pass ? "All checks passed" : "No checks",
            offer.review == "APPROVED" ? "Approved" : "",
            "No conflicts",
        ].filter { !$0.isEmpty }.joined(separator: " · ")
    }
}

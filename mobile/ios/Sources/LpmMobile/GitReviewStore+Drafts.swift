import Foundation

/// Review state that outlives the review screen: what was viewed (and whether it
/// changed since), and the commit being written.
extension GitReviewStore {
    func toggleViewed(_ project: String, path: String) {
        var set = viewed[project] ?? []
        let key = diffKey(project, path)
        if set.contains(path) {
            set.remove(path)
            viewedDiff[key] = nil
        } else {
            set.insert(path)
            viewedDiff[key] = diffs[key]?.diff.hashValue
        }
        viewed[project] = set
        changedSinceViewed[project]?[path] = nil
    }

    func changedSinceViewed(_ project: String, path: String) -> Date? {
        changedSinceViewed[project]?[path]
    }

    /// A viewed file's diff arrived: remember it if the file was marked before its
    /// diff loaded, or take Viewed away when it isn't the diff that was seen.
    func noteViewedDiff(_ project: String, path: String, key: String, diff: String) {
        guard isViewed(project, path: path) else { return }
        guard let seen = viewedDiff[key] else { viewedDiff[key] = diff.hashValue; return }
        guard seen != diff.hashValue else { return }
        viewed[project]?.remove(path)
        viewedDiff[key] = nil
        changedSinceViewed[project, default: [:]][path] = Date()
    }

    func clearCommitDraft(_ project: String) {
        commitDrafts[project] = nil
    }
}

/// A commit being written: its message, the files left out of it, and the message
/// the Mac last drafted.
struct CommitDraft: Equatable {
    var message = ""
    var deselected: Set<String> = []
    var drafted: String?

    var isEmpty: Bool { message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && deselected.isEmpty }
}

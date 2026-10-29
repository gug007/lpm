import Foundation

/// The Mac's Settings › Git › Auto pull: off everywhere, only for the
/// projects set to On, or for every project not set to Off.
enum AutoPullMode: String {
    case off, chosen, all

    init(wire: Any?) {
        self = (wire as? String).flatMap(AutoPullMode.init(rawValue:)) ?? .off
    }
}

/// Whether lpm fast-forwards a project by itself, resolved exactly as the
/// desktop does: the Mac's setting gates everything, then the project's own
/// choice, then (for a duplicate or worktree) its parent's, then the setting.
func autoPullEnabled(own: Bool?, parent: Project?, mode: AutoPullMode) -> Bool {
    guard mode != .off else { return false }
    return own ?? parent?.autoPull ?? (mode == .all)
}

/// The project's last auto pull, present only while it can still be undone.
struct AutoPulled {
    let count: Int
    let branch: String
    let from: String
    let to: String
    let at: Int

    init?(_ o: Any?) {
        guard let o = o as? [String: Any] else { return nil }
        count = o["count"] as? Int ?? 0
        branch = o["branch"] as? String ?? ""
        from = o["from"] as? String ?? ""
        to = o["to"] as? String ?? ""
        at = o["at"] as? Int ?? 0
    }

    var summary: String {
        let commits = "\(count) commit\(count == 1 ? "" : "s")"
        return branch.isEmpty ? commits : "\(commits) on \(branch)"
    }
}

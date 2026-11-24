import Foundation

/// What removing a duplicate deletes, and the work that exists only in it, in the
/// words of the desktop's delete dialog (DeleteCopyBody, unsavedWork.ts).
enum CopyRemoval {
    /// The confirmation's message. `snapshot` is the copy's git status, nil while
    /// it's still being read.
    static func message(for project: Project, snapshot: GitSnapshot?, checking: Bool) -> String {
        var text = project.worktree
            ? "This deletes “\(project.label)”: its worktree folder, everything inside it, and its branch \(project.worktreeBranch ?? worktreeBranchName(project.name)). This can't be undone."
            : "This deletes “\(project.label)” and its folder from disk. This can't be undone."
        if checking {
            text += "\n\nChecking for unsaved work…"
        } else if let snapshot {
            let lines = unsavedWorkLines(snapshot)
            if !lines.isEmpty {
                text += "\n\nWork that exists only here:\n" + lines.map { "• \($0)" }.joined(separator: "\n")
            }
        }
        return text
    }

    /// Uncommitted and untracked files, and commits not pushed. Without an
    /// upstream the commits count against the default branch, which the Mac
    /// sends as `aheadOfDefault`.
    static func unsavedWorkLines(_ s: GitSnapshot) -> [String] {
        guard s.isRepo else { return [] }
        let untracked = s.files.filter { $0.status == "untracked" }.count
        let changed = Set(s.files.filter { $0.status != "untracked" }.map(\.path)).count
        var lines: [String] = []
        if changed > 0 { lines.append("\(count(changed, "changed file", "changed files")) not committed") }
        if untracked > 0 { lines.append(count(untracked, "untracked file", "untracked files")) }
        if s.hasUpstream {
            if s.ahead > 0 { lines.append("\(count(s.ahead, "commit", "commits")) not pushed") }
        } else if let ahead = s.aheadOfDefault, ahead > 0, !s.defaultBranch.isEmpty {
            lines.append("\(count(ahead, "commit", "commits")) not on \(s.defaultBranch)")
        }
        return lines
    }

    /// The branch lpm made for a worktree, deleted with it, unless the project
    /// names another. Mirrors projects_crud.rs worktree_branch_name.
    static func worktreeBranchName(_ name: String) -> String {
        var component = ""
        for ch in name {
            let normalized: Character = ch.isASCII && (ch.isLetter || ch.isNumber || ch == "-" || ch == "_") ? ch : "-"
            if normalized != "-" || !component.hasSuffix("-") { component.append(normalized) }
        }
        let trimmed = component.trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        return "lpm/\(trimmed.isEmpty ? "worktree" : trimmed)"
    }

    private static func count(_ n: Int, _ one: String, _ many: String) -> String {
        "\(n) \(n == 1 ? one : many)"
    }
}

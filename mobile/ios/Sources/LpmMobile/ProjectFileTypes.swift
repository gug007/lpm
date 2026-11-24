import Foundation

/// One entry of a project folder (the `listDir` reply). `status` is the file's
/// git status word, nil when unchanged; `changed` counts the changed files
/// anywhere below a folder.
struct ProjectFileEntry: Identifiable, Equatable {
    let name: String
    let dir: Bool
    let ignored: Bool
    let status: String?
    let changed: Int

    var id: String { name }

    init(_ o: [String: Any]) {
        name = o["name"] as? String ?? ""
        dir = o["dir"] as? Bool ?? false
        ignored = o["ignored"] as? Bool ?? false
        status = (o["status"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        changed = o["changed"] as? Int ?? 0
    }
}

/// One `listDir` reply: a folder of a project, `entries` nil on a failure.
/// `root` is the project's absolute folder, when the Mac says.
struct ProjectDirContents {
    let project: String
    let dir: String
    let entries: [ProjectFileEntry]?
    let error: String?
    let root: String?

    init(_ o: [String: Any]) {
        let ok = o["ok"] as? Bool ?? false
        project = o["project"] as? String ?? ""
        dir = o["dir"] as? String ?? ""
        entries = ok ? (o["entries"] as? [[String: Any]] ?? []).map(ProjectFileEntry.init) : nil
        error = ok ? nil : (o["error"] as? String ?? "Couldn't open this folder.")
        root = (o["root"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    }
}

/// One `locatePath` reply: where a path typed into Go to File leads on the Mac.
struct LocatedPath: Equatable {
    enum Kind: String { case file, dir, missing }

    let project: String
    /// The path as it was typed.
    let typed: String
    /// nil when the Mac couldn't say.
    let kind: Kind?
    /// Absolute on the Mac.
    let path: String
    /// Its place in the project, empty for the project's own folder; nil outside it.
    let rel: String?

    init(_ o: [String: Any]) {
        let ok = o["ok"] as? Bool ?? false
        project = o["project"] as? String ?? ""
        typed = o["path"] as? String ?? ""
        kind = ok ? (o["kind"] as? String).flatMap(Kind.init) : nil
        path = o["at"] as? String ?? ""
        rel = o["rel"] as? String
    }
}

/// What in Go to File reads as a path rather than part of a name: one that starts
/// at the home folder or the folder above, or at the root or a leading dot with
/// something after it.
func typedPath(_ query: String) -> String? {
    let path = query.trimmingCharacters(in: .whitespacesAndNewlines)
    if path.hasPrefix("~/") || path.hasPrefix("../") { return path }
    let start = ["/", "./"].first { path.hasPrefix($0) }
    guard let start, path.count > start.count else { return nil }
    return path
}

/// A folder by its place in the project, where it has one: a folder outside can hold
/// the project's own.
func projectDir(_ dir: String, root: String?) -> String {
    guard let root, dir.hasPrefix(root + "/") else { return dir }
    return String(dir.dropFirst(root.count + 1))
}

/// A folder outside the project goes by its absolute path on the machine: `/…`, or
/// a drive's or a share's on a Windows PC.
func isOutsideProject(_ dir: String) -> Bool {
    if dir.hasPrefix("/") || dir.hasPrefix("\\\\") { return true }
    let drive = Array(dir.prefix(3))
    return drive.count == 3 && drive[0].isLetter && drive[1] == ":" && (drive[2] == "\\" || drive[2] == "/")
}

/// `dir` joined with `name`, `/`-separated.
func projectPath(_ dir: String, _ name: String) -> String {
    dir.isEmpty || dir.hasSuffix("/") ? dir + name : "\(dir)/\(name)"
}

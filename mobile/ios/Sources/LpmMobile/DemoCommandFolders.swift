import Foundation

/// The demo's rules for folders, as the Mac keeps them: a folder is the path to it,
/// each level is listed, and what's inside a folder moves with it.
extension DemoServer {
    private static let forbiddenFolderChars = "\\:*?\"<>|"
    private static let maxFolderPathLength = 255

    /// Sorts what's inside a folder right after it.
    static func folderOrder(_ folder: String) -> String {
        folder.lowercased().replacingOccurrences(of: "/", with: "\u{0}")
    }

    func changeFolder(_ project: String, _ o: [String: Any]) throws {
        let name = try Self.checkFolder(o["name"] as? String ?? "")
        let existing = { (list: DemoWorld.CommandList, folder: String) in
            list.folders.first { $0.lowercased() == folder.lowercased() }
        }
        try updateCommands(project, Self.scope(o)) { list in
            switch o["op"] as? String {
            case "create":
                if existing(list, name) != nil { throw DemoCommandError("A folder named \(name) already exists.") }
                Self.addFolder(&list.folders, name)
            case "rename":
                let to = try Self.checkFolder(o["newName"] as? String ?? "")
                guard name != to else { return }
                guard let current = existing(list, name) else { throw DemoCommandError("The \(name) folder is gone.") }
                if to.lowercased().hasPrefix("\(current.lowercased())/") {
                    throw DemoCommandError("A folder can't move into itself.")
                }
                if name.lowercased() != to.lowercased(), existing(list, to) != nil {
                    throw DemoCommandError("A folder named \(to) already exists.")
                }
                Self.moveFolder(&list, from: current, to: to)
            case "delete":
                guard let current = existing(list, name) else { return }
                for c in list.commands where c.folder == current {
                    if let other = list.commands.first(where: {
                        $0.folder != current && $0.name.lowercased() == c.name.lowercased()
                    }) {
                        throw DemoCommandError("/\(other.name) is also in \(Self.placeLabel(other.folder)); rename one of them first.")
                    }
                }
                let parent = current.lastIndex(of: "/").map { String(current[..<$0]) }
                Self.moveFolder(&list, from: current, to: parent)
            default:
                throw DemoCommandError("unknown folder op")
            }
        }
    }

    /// Lists `path` and the folders it sits inside, and gives it back as the list
    /// spells it.
    @discardableResult
    static func addFolder(_ folders: inout [String], _ path: String) -> String {
        var spelled = ""
        for level in path.split(separator: "/") {
            let next = spelled.isEmpty ? String(level) : "\(spelled)/\(level)"
            if let listed = folders.first(where: { $0.lowercased() == next.lowercased() }) {
                spelled = listed
            } else {
                folders.append(next)
                spelled = next
            }
        }
        return spelled
    }

    /// What `folder` becomes when the folder `from` becomes `to`, nil being the top
    /// of the list.
    private static func moved(_ folder: String?, from: String, to: String?) -> String? {
        guard let folder else { return nil }
        if folder == from { return to }
        guard folder.hasPrefix("\(from)/") else { return folder }
        let rest = String(folder.dropFirst(from.count + 1))
        return to.map { "\($0)/\(rest)" } ?? rest
    }

    private static func moveFolder(_ list: inout DemoWorld.CommandList, from: String, to: String?) {
        var folders: [String] = []
        for folder in list.folders {
            if let kept = moved(folder, from: from, to: to) { addFolder(&folders, kept) }
        }
        list.folders = folders
        for i in list.others.indices { list.others[i].folder = moved(list.others[i].folder, from: from, to: to) }
        for i in list.commands.indices { list.commands[i].folder = moved(list.commands[i].folder, from: from, to: to) }
    }

    static func cleanFolder(_ raw: String?) throws -> String? {
        guard let f = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !f.isEmpty else { return nil }
        return try checkFolder(f)
    }

    private static func checkFolder(_ raw: String) throws -> String {
        let levels = raw.split(separator: "/", omittingEmptySubsequences: false)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard !levels.isEmpty else { throw DemoCommandError("Give the folder a name.") }
        for level in levels {
            let control = level.unicodeScalars.contains { CharacterSet.controlCharacters.contains($0) }
            if level.count > 64 || level.hasPrefix(".") || control
                || level.contains(where: { forbiddenFolderChars.contains($0) }) {
                throw DemoCommandError("A folder name can't start with a dot or hold any of \(forbiddenFolderChars).")
            }
        }
        let path = levels.joined(separator: "/")
        if path.count > maxFolderPathLength { throw DemoCommandError("Those folders are nested too deep.") }
        return path
    }
}

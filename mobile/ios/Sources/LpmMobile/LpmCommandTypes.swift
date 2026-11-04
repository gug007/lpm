import Foundation

// lpm commands: prompts saved as files on the Mac and run by typing `/name` in a
// terminal's composer. See ../../PROTOCOL.md ("lpm commands").

enum LpmCommandScope: String, CaseIterable, Identifiable {
    case project
    case global

    var id: String { rawValue }
    var title: String { self == .project ? "This project" : "Global" }
    /// How the `/` menu's headings name the list.
    var menuLabel: String { self == .project ? "this project" : "global" }
}

struct LpmCommand: Identifiable, Equatable {
    let name: String
    let folder: String?
    let description: String
    let body: String
    let scope: LpmCommandScope
    let argumentHint: String
    /// Git ignores it and holds none of its files. False from a Mac on an older lpm.
    let keptOutOfGit: Bool
    /// Git holds some of its files. False from a Mac on an older lpm.
    let tracked: Bool
    /// How often it ran on the Mac and when last (unix millis); 0 and nil before
    /// its first run, and from a Mac on an older lpm.
    let runs: Int
    let lastRunAt: Int?

    var id: String { "\(scope.rawValue):\(folder ?? ""):\(name)" }
    var ref: LpmCommandRef { LpmCommandRef(scope: scope, folder: folder, name: name) }

    /// The line shown under the name: its description, else the prompt's first line.
    var summary: String {
        if !description.isEmpty { return description }
        return body.split(whereSeparator: \.isNewline).first.map(String.init) ?? ""
    }

    init(_ o: [String: Any]) {
        name = o["name"] as? String ?? ""
        folder = o["folder"] as? String
        description = o["description"] as? String ?? ""
        body = o["body"] as? String ?? ""
        scope = LpmCommandScope(rawValue: o["scope"] as? String ?? "") ?? .global
        argumentHint = o["argumentHint"] as? String ?? ""
        keptOutOfGit = o["keptOutOfGit"] as? Bool ?? false
        tracked = o["tracked"] as? Bool ?? false
        runs = (o["runs"] as? NSNumber)?.intValue ?? 0
        lastRunAt = (o["lastRunAt"] as? NSNumber)?.intValue
    }

    /// "2h · 14×": how long ago it last ran and how often, as the desktop's
    /// Skills tab shows it; nil before its first run.
    func runsLabel(now: Date = Date()) -> String? {
        guard runs > 0, let lastRunAt else { return nil }
        return "\(Self.runAge(lastRunAt, now: now)) · \(runs)×"
    }

    static func runAge(_ at: Int, now: Date) -> String {
        let minute = 60_000, hour = 60 * minute, day = 24 * hour
        let ago = max(0, Int(now.timeIntervalSince1970 * 1000) - at)
        if ago < minute { return "now" }
        if ago < hour { return "\(ago / minute)m" }
        if ago < day { return "\(ago / hour)h" }
        if ago < 60 * day { return "\(ago / day)d" }
        if ago < 365 * day { return "\(ago / (30 * day))mo" }
        return "\(ago / (365 * day))y"
    }
}

/// A skill in a list's places that wasn't made in lpm: shown, never changed.
struct OtherSkill: Identifiable, Equatable {
    let name: String
    let description: String
    let preview: String
    let agents: [String]
    let path: String
    let folder: String?
    /// With the list's skills in no folder, out of the Other skills group.
    let atRoot: Bool

    var id: String { name }

    /// Every agent lpm knows, and whether it reads this skill.
    var reach: [(label: String, reads: Bool)] {
        ["claude", "codex", "gemini", "opencode"].map { (agentCommandsLabel($0), agents.contains($0)) }
    }

    init(_ o: [String: Any]) {
        name = o["name"] as? String ?? ""
        description = o["description"] as? String ?? ""
        preview = o["preview"] as? String ?? ""
        agents = o["agents"] as? [String] ?? []
        path = o["path"] as? String ?? ""
        folder = o["folder"] as? String
        atRoot = o["atRoot"] as? Bool ?? false
    }
}

struct LpmCommandList: Equatable {
    let folders: [String]
    let commands: [LpmCommand]
    /// Empty from a Mac on an older lpm.
    let others: [OtherSkill]
    /// The list is a project's in a git repo. False from a Mac on an older lpm.
    let inRepo: Bool

    /// The folders directly inside `parent`, or at the top of the list for nil.
    func subfolders(of parent: String?) -> [String] {
        folders.filter { LpmFolderPath.parent($0) == parent }
    }

    /// The commands in a folder and the folders inside it, and the other skills
    /// shown there. The Other skills group has its own row, so No folder doesn't count it.
    func count(in folder: String?) -> Int {
        guard let folder else { return commands.filter { $0.folder == nil }.count + others(in: nil).count }
        let held = { (f: String?) in f.map { LpmFolderPath.isWithin($0, folder) } ?? false }
        return commands.filter { held($0.folder) }.count + others.filter { held($0.folder) }.count
    }

    /// The other skills shown with a folder's commands, or with the ones in no folder.
    func others(in folder: String?) -> [OtherSkill] {
        others.filter { $0.folder == folder && (folder != nil || $0.atRoot) }
    }

    /// The other skills in neither: the Other skills group.
    var otherGroup: [OtherSkill] { others.filter { $0.folder == nil && !$0.atRoot } }

    init(_ o: [String: Any]) {
        folders = o["folders"] as? [String] ?? []
        commands = (o["commands"] as? [[String: Any]] ?? []).map(LpmCommand.init)
        others = (o["others"] as? [[String: Any]] ?? []).map(OtherSkill.init)
        inRepo = o["inRepo"] as? Bool ?? false
    }
}

/// Both lists for one project. `project` is nil outside a project, or when its
/// list couldn't be read (`projectError` says why).
struct LpmCommandLists: Equatable {
    let global: LpmCommandList
    let project: LpmCommandList?
    let projectError: String?

    func list(_ scope: LpmCommandScope) -> LpmCommandList? { scope == .global ? global : project }

    /// The lists a command can go in: the project's own, when the Mac sent one,
    /// and the global one.
    var scopes: [LpmCommandScope] { project == nil ? [.global] : [.project, .global] }

    init(_ o: [String: Any]) {
        global = LpmCommandList(o["global"] as? [String: Any] ?? [:])
        project = (o["project"] as? [String: Any]).map(LpmCommandList.init)
        projectError = o["projectError"] as? String
    }
}

/// A folder is the path to it: `Work/Reviews` sits inside `Work`, and a list names
/// every level.
enum LpmFolderPath {
    /// The folder holding this one, nil at the top of a list.
    static func parent(_ folder: String) -> String? {
        folder.lastIndex(of: "/").map { String(folder[..<$0]) }
    }

    /// A folder's own name, without the folders it sits inside.
    static func label(_ folder: String) -> String {
        folder.lastIndex(of: "/").map { String(folder[folder.index(after: $0)...]) } ?? folder
    }

    /// The folder named `name` inside `parent`. Blank stays blank, for the Mac to refuse.
    static func child(_ parent: String?, _ name: String) -> String {
        let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let parent, !name.isEmpty else { return name }
        return "\(parent)/\(name)"
    }

    /// `folder` is `parent` or sits somewhere inside it.
    static func isWithin(_ folder: String, _ parent: String) -> Bool {
        folder == parent || folder.hasPrefix("\(parent)/")
    }
}

/// Where a command lives: its list, folder and name.
struct LpmCommandRef: Hashable {
    let scope: LpmCommandScope
    let folder: String?
    let name: String

    var wire: [String: Any] {
        ["scope": scope.rawValue, "folder": folder ?? NSNull(), "name": name]
    }
}

/// A command as the editor holds it: a new one (`original` nil) or an edit of the
/// saved `original`, which a changed name, folder or list moves.
struct LpmCommandDraft: Identifiable {
    let id = UUID()
    let original: LpmCommandRef?
    var scope: LpmCommandScope
    var folder: String?
    var name: String
    var description: String
    var body: String
    var keepOutOfGit = false

    static func new(scope: LpmCommandScope, folder: String? = nil, body: String = "") -> LpmCommandDraft {
        LpmCommandDraft(original: nil, scope: scope, folder: folder, name: "", description: "", body: body)
    }

    static func editing(_ c: LpmCommand) -> LpmCommandDraft {
        LpmCommandDraft(original: c.ref, scope: c.scope, folder: c.folder, name: c.name,
                        description: c.description, body: c.body, keepOutOfGit: c.keptOutOfGit)
    }

    var place: LpmCommandRef { LpmCommandRef(scope: scope, folder: folder, name: name) }
    var isValid: Bool {
        LpmCommandRules.isValidName(name) && !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

/// The prompt a run sends, and the `{{variables}}` still left in it.
struct LpmCommandExpansion {
    let text: String
    let missing: [String]
}

/// Any reply to an `lpmCommand*` request, matched to its request by `reqId`.
struct LpmCommandReply {
    let reqId: String
    let lists: LpmCommandLists?
    let expansion: LpmCommandExpansion?
    let error: String?

    init(_ o: [String: Any]) {
        reqId = Wire.reqIdString(o["reqId"])
        let ok = o["ok"] as? Bool ?? false
        lists = ok ? (o["lists"] as? [String: Any]).map(LpmCommandLists.init) : nil
        expansion = ok && o["t"] as? String == "lpmCommandExpand"
            ? LpmCommandExpansion(text: o["text"] as? String ?? "", missing: o["missing"] as? [String] ?? [])
            : nil
        error = ok ? nil : (o["error"] as? String ?? "Couldn't reach your skills on the Mac.")
    }
}

enum LpmFolderOp: String {
    case create, rename, delete
}

enum LpmCommandRules {
    static let autoVariables = ["branch", "project", "dir"]

    static func isValidName(_ name: String) -> Bool {
        name.range(of: "^(?=.{1,64}$)[a-z0-9]+(-[a-z0-9]+)*$", options: .regularExpression) != nil
    }

    /// Each `{{name}}` in a prompt once, in order: the ones a run asks for, and
    /// the ones lpm fills in by itself.
    static func variables(_ body: String) -> (asks: [String], auto: [String]) {
        var asks: [String] = []
        var auto: [String] = []
        guard let re = try? NSRegularExpression(pattern: "\\{\\{\\s*([A-Za-z0-9_-]+)\\s*\\}\\}") else {
            return ([], [])
        }
        for m in re.matches(in: body, range: NSRange(body.startIndex..., in: body)) {
            guard let r = Range(m.range(at: 1), in: body) else { continue }
            let name = String(body[r])
            if autoVariables.contains(name) {
                if !auto.contains(name) { auto.append(name) }
            } else if !asks.contains(name) {
                asks.append(name)
            }
        }
        return (asks, auto)
    }

    /// The `/name args` a whole message is when it could run a command.
    static func parseRun(_ text: String) -> (name: String, args: String)? {
        guard let re = try? NSRegularExpression(pattern: "^\\s*/([A-Za-z0-9][A-Za-z0-9_-]*)(?:\\s+([\\s\\S]*))?$"),
              let m = re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              let nameRange = Range(m.range(at: 1), in: text) else { return nil }
        let args = Range(m.range(at: 2), in: text).map { String(text[$0]) } ?? ""
        return (String(text[nameRange]), args.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    /// The note shown when a run still needs a value its arguments didn't give.
    static func missingNote(_ missing: [String]) -> String {
        "Fill in \(missing.map { "{{\($0)}}" }.joined(separator: ", ")), then send."
    }
}

extension Wire {
    static func lpmCommands(project: String, reqId: String) -> String {
        json(["t": "lpmCommands", "project": project, "reqId": reqId])
    }

    static func lpmCommandSave(project: String, command: LpmCommandRef, description: String, body: String,
                               keepOutOfGit: Bool?, previous: LpmCommandRef?, reqId: String) -> String {
        var input = command.wire
        input["description"] = description
        input["body"] = body
        if let keepOutOfGit { input["keepOutOfGit"] = keepOutOfGit }
        return json(["t": "lpmCommandSave", "project": project, "command": input,
                     "previous": previous?.wire ?? NSNull(), "reqId": reqId])
    }

    static func lpmCommandDelete(project: String, target: LpmCommandRef, reqId: String) -> String {
        json(["t": "lpmCommandDelete", "project": project, "target": target.wire, "reqId": reqId])
    }

    static func lpmCommandFolder(project: String, op: LpmFolderOp, scope: LpmCommandScope, name: String,
                                 newName: String?, reqId: String) -> String {
        var o: [String: Any] = ["t": "lpmCommandFolder", "project": project, "op": op.rawValue,
                                "scope": scope.rawValue, "name": name, "reqId": reqId]
        if let newName { o["newName"] = newName }
        return json(o)
    }

    static func lpmCommandOtherFolder(project: String, scope: LpmCommandScope, name: String, folder: String?,
                                      root: Bool = false, reqId: String) -> String {
        var frame: [String: Any] = ["t": "lpmCommandOtherFolder", "project": project, "scope": scope.rawValue,
                                    "name": name, "folder": folder ?? NSNull(), "reqId": reqId]
        if root { frame["root"] = true }
        return json(frame)
    }

    static func lpmCommandConvert(project: String, scope: LpmCommandScope, name: String, toLpm: Bool,
                                  reqId: String) -> String {
        json(["t": "lpmCommandConvert", "project": project, "scope": scope.rawValue, "name": name,
              "toLpm": toLpm, "reqId": reqId])
    }

    static func lpmCommandExpand(project: String, name: String, args: String, cli: String, reqId: String) -> String {
        json(["t": "lpmCommandExpand", "project": project, "name": name, "args": args, "cli": cli, "reqId": reqId])
    }
}

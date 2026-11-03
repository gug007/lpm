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
    }
}

struct LpmCommandList: Equatable {
    let folders: [String]
    let commands: [LpmCommand]

    func count(in folder: String?) -> Int { commands.filter { $0.folder == folder }.count }

    init(_ o: [String: Any]) {
        folders = o["folders"] as? [String] ?? []
        commands = (o["commands"] as? [[String: Any]] ?? []).map(LpmCommand.init)
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

    static func new(scope: LpmCommandScope, folder: String? = nil, body: String = "") -> LpmCommandDraft {
        LpmCommandDraft(original: nil, scope: scope, folder: folder, name: "", description: "", body: body)
    }

    static func editing(_ c: LpmCommand) -> LpmCommandDraft {
        LpmCommandDraft(original: c.ref, scope: c.scope, folder: c.folder, name: c.name,
                        description: c.description, body: c.body)
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
        error = ok ? nil : (o["error"] as? String ?? "Couldn't reach your commands on the Mac.")
    }
}

enum LpmFolderOp: String {
    case create, rename, delete
}

enum LpmCommandRules {
    static let autoVariables = ["branch", "project"]

    static func isValidName(_ name: String) -> Bool {
        name.range(of: "^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$", options: .regularExpression) != nil
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
                               previous: LpmCommandRef?, reqId: String) -> String {
        var input = command.wire
        input["description"] = description
        input["body"] = body
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

    static func lpmCommandExpand(project: String, name: String, args: String, reqId: String) -> String {
        json(["t": "lpmCommandExpand", "project": project, "name": name, "args": args, "reqId": reqId])
    }
}

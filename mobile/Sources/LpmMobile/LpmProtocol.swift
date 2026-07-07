import Foundation

// Wire types for the lpm mobile ↔ desktop protocol. See ../../PROTOCOL.md.
// Inbound frames are decoded leniently (unknown `t` is ignored); outbound frames
// are small dictionaries encoded to compact JSON text.

enum Wire {
    // MARK: Outbound

    static func json(_ obj: [String: Any]) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: obj),
              let s = String(data: data, encoding: .utf8) else { return "{}" }
        return s
    }

    static func pair(code: String, name: String) -> String {
        json(["t": "pair", "code": code, "name": name])
    }
    static func auth(deviceId: String, token: String) -> String {
        json(["t": "auth", "deviceId": deviceId, "token": token])
    }
    static func projects() -> String { json(["t": "projects"]) }
    static func sidebar() -> String { json(["t": "sidebar"]) }
    static func terminals(project: String) -> String { json(["t": "terminals", "project": project]) }
    static func slash(id: String, project: String) -> String {
        json(["t": "slash", "id": id, "project": project])
    }
    static func upload(id: String, data: String, mime: String) -> String {
        json(["t": "upload", "id": id, "data": data, "mime": mime])
    }
    static func mentions(project: String) -> String { json(["t": "mentions", "project": project]) }
    static func history(project: String, q: String) -> String {
        json(["t": "history", "project": project, "q": q])
    }
    static func historyAdd(project: String, id: String, label: String, text: String) -> String {
        json(["t": "historyAdd", "project": project, "id": id, "label": label, "text": text])
    }
    static func status(project: String) -> String { json(["t": "status", "project": project]) }
    static func sub(id: String) -> String { json(["t": "sub", "id": id]) }
    static func unsub(id: String) -> String { json(["t": "unsub", "id": id]) }
    static func input(id: String, data: String) -> String { json(["t": "in", "id": id, "d": data]) }
    static func resize(id: String, cols: Int, rows: Int) -> String {
        json(["t": "resize", "id": id, "cols": cols, "rows": rows])
    }
    static func runAction(project: String, action: String) -> String {
        json(["t": "runAction", "project": project, "action": action])
    }
    static func newTerminal(project: String) -> String {
        json(["t": "newTerminal", "project": project])
    }
    static func start(name: String, profile: String = "") -> String {
        json(["t": "start", "name": name, "profile": profile])
    }
    static func stop(name: String) -> String { json(["t": "stop", "name": name]) }
    static func toggleService(name: String, service: String) -> String {
        json(["t": "toggleService", "name": name, "service": service])
    }
    static func ping() -> String { json(["t": "ping"]) }

    /// Frame raw non-UTF-8 input the way the desktop expects (null + "HEX:" + hex).
    static func hexFrame(_ bytes: [UInt8]) -> String {
        "\u{0}HEX:" + bytes.map { String(format: "%02x", $0) }.joined()
    }

    /// The desktop shows `label || name`; an empty label string (common in YAML)
    /// must fall back to another key too, not just a missing one.
    static func label(_ o: [String: Any], fallback key: String) -> String {
        let lbl = (o["label"] as? String) ?? ""
        return lbl.isEmpty ? (o[key] as? String ?? "") : lbl
    }

    // MARK: Inbound

    enum Inbound {
        case paired(deviceId: String, token: String)
        case ready
        case error(String)
        case projects([Project])
        case sidebar(order: [String], groups: [ProjectFolder])
        case terminals(project: String, [TerminalInfo])
        case slash(id: String, [SlashCommand])
        case mentions(project: String, [MentionEntry])
        case history(project: String, [HistoryRow])
        case upload(id: String, path: String)
        case status(project: String, [StatusEntry])
        case seed(id: String, cols: Int, rows: Int, data: String)
        case output(id: String, data: String)
        case exit(id: String, code: Int)
        case projectsChanged
        case statusChanged(project: String)
        case pong
        case unknown

        static func parse(_ text: String) -> Inbound {
            guard let data = text.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let t = obj["t"] as? String
            else { return .unknown }

            switch t {
            case "paired":
                return .paired(deviceId: obj["deviceId"] as? String ?? "",
                               token: obj["token"] as? String ?? "")
            case "ready": return .ready
            case "error": return .error(obj["error"] as? String ?? "error")
            case "projects":
                return .projects((obj["projects"] as? [[String: Any]] ?? []).map(Project.init))
            case "sidebar":
                return .sidebar(
                    order: obj["order"] as? [String] ?? [],
                    groups: (obj["groups"] as? [[String: Any]] ?? []).map(ProjectFolder.init)
                )
            case "terminals":
                return .terminals(project: obj["project"] as? String ?? "",
                                  (obj["terminals"] as? [[String: Any]] ?? []).map(TerminalInfo.init))
            case "slash":
                return .slash(id: obj["id"] as? String ?? "",
                              (obj["commands"] as? [[String: Any]] ?? []).map(SlashCommand.init))
            case "mentions":
                return .mentions(project: obj["project"] as? String ?? "",
                                 (obj["entries"] as? [[String: Any]] ?? []).map(MentionEntry.init))
            case "history":
                return .history(project: obj["project"] as? String ?? "",
                                (obj["rows"] as? [[String: Any]] ?? []).map(HistoryRow.init))
            case "upload":
                let ok = obj["ok"] as? Bool ?? false
                return .upload(id: obj["id"] as? String ?? "",
                               path: ok ? (obj["path"] as? String ?? "") : "")
            case "status":
                return .status(project: obj["project"] as? String ?? "",
                               (obj["status"] as? [[String: Any]] ?? []).map(StatusEntry.init))
            case "seed":
                return .seed(id: obj["id"] as? String ?? "",
                             cols: obj["cols"] as? Int ?? 80,
                             rows: obj["rows"] as? Int ?? 24,
                             data: obj["data"] as? String ?? "")
            case "o":
                return .output(id: obj["id"] as? String ?? "", data: obj["d"] as? String ?? "")
            case "exit":
                return .exit(id: obj["id"] as? String ?? "", code: obj["code"] as? Int ?? 0)
            case "projects-changed": return .projectsChanged
            case "status-changed": return .statusChanged(project: obj["project"] as? String ?? "")
            case "pong": return .pong
            default: return .unknown
            }
        }
    }
}

struct Project: Identifiable {
    let name: String
    let label: String
    let running: Bool
    let isRemote: Bool
    let statusEntries: [StatusEntry]
    let services: [Service]
    let actions: [Action]

    var id: String { name }

    init(_ o: [String: Any]) {
        name = o["name"] as? String ?? ""
        label = Wire.label(o, fallback: "name")
        running = o["running"] as? Bool ?? false
        isRemote = o["isRemote"] as? Bool ?? false
        statusEntries = (o["statusEntries"] as? [[String: Any]] ?? []).map(StatusEntry.init)
        services = (o["services"] as? [[String: Any]] ?? []).map(Service.init)
        actions = (o["actions"] as? [[String: Any]] ?? []).map(Action.init)
    }

    private init(name: String, label: String, running: Bool, isRemote: Bool,
                 statusEntries: [StatusEntry], services: [Service], actions: [Action]) {
        self.name = name; self.label = label; self.running = running; self.isRemote = isRemote
        self.statusEntries = statusEntries; self.services = services; self.actions = actions
    }

    /// A copy with fresh status — used by the status-changed push, which must not
    /// erase the project's services/actions (a partial dict rebuild would).
    func withStatus(_ entries: [StatusEntry]) -> Project {
        Project(name: name, label: label, running: running, isRemote: isRemote,
                statusEntries: entries, services: services, actions: actions)
    }
}

/// A project action the phone can run (mirrors the Rust ActionInfo). `name` may be
/// a composite `parent:child` path; `children` nest into submenus. A leaf (no
/// children) is runnable; a node with children is a menu.
struct Action: Identifiable {
    let name: String
    let label: String
    let emoji: String
    let type: String   // terminal | command | background | ""
    let display: String
    let children: [Action]

    var id: String { name }
    var isRunnable: Bool { children.isEmpty }

    init(_ o: [String: Any]) {
        name = o["name"] as? String ?? ""
        let lbl = o["label"] as? String ?? ""
        label = lbl.isEmpty ? name : lbl
        emoji = o["emoji"] as? String ?? ""
        type = o["type"] as? String ?? ""
        display = o["display"] as? String ?? ""
        children = (o["children"] as? [[String: Any]] ?? []).map(Action.init)
    }

    /// All runnable leaves under this action, depth-first (self if it's a leaf).
    var runnableLeaves: [Action] {
        isRunnable ? [self] : children.flatMap { $0.runnableLeaves }
    }
}

/// A sidebar folder (groups.json). `members` are project names contained in it.
/// Named ProjectFolder to avoid colliding with SwiftUI's built-in `Group`.
struct ProjectFolder: Identifiable {
    let id: String
    let name: String
    let collapsed: Bool
    let members: [String]

    init(_ o: [String: Any]) {
        id = o["id"] as? String ?? ""
        name = o["name"] as? String ?? "Folder"
        collapsed = o["collapsed"] as? Bool ?? false
        members = o["members"] as? [String] ?? []
    }
}

struct Service: Identifiable {
    let name: String
    var id: String { name }
    init(_ o: [String: Any]) { name = o["name"] as? String ?? "" }
}

struct TerminalInfo: Identifiable {
    let id: String
    let label: String
    let project: String
    let cols: Int
    let rows: Int
    let remote: Bool

    init(_ o: [String: Any]) {
        id = o["id"] as? String ?? ""
        // The desktop tab name; falls back to the id for older servers.
        label = Wire.label(o, fallback: "id")
        project = o["project"] as? String ?? ""
        cols = o["cols"] as? Int ?? 80
        rows = o["rows"] as? Int ?? 24
        remote = o["remote"] as? Bool ?? false
    }
}

/// One recalled message (mirrors the Rust HistoryRow). Drafts are filtered out by
/// the UI; only sent prompts are offered for recall.
struct HistoryRow: Identifiable {
    let id: String
    let text: String
    let terminalLabel: String
    let isDraft: Bool

    init(_ o: [String: Any]) {
        id = o["id"] as? String ?? ""
        text = o["text"] as? String ?? ""
        terminalLabel = o["terminalLabel"] as? String ?? ""
        isDraft = o["isDraft"] as? Bool ?? false
    }
}

/// One @-mention target: a project file/dir (relative path the agent resolves).
/// `changed` marks a git working-tree change, surfaced first in the menu.
struct MentionEntry: Identifiable {
    let path: String
    let dir: Bool
    let changed: Bool

    var id: String { path }

    init(_ o: [String: Any]) {
        path = o["path"] as? String ?? ""
        dir = o["dir"] as? Bool ?? false
        changed = o["changed"] as? Bool ?? false
    }
}

/// One slash-command autocomplete entry (mirrors the Rust AgentCommand): a CLI
/// built-in or a project/user command discovered on disk.
struct SlashCommand: Identifiable {
    let name: String        // no leading "/", e.g. "review" or "prompts:draftpr"
    let description: String
    let argumentHint: String
    let source: String      // builtin | project | user

    var id: String { name }

    init(_ o: [String: Any]) {
        name = o["name"] as? String ?? ""
        description = o["description"] as? String ?? ""
        argumentHint = o["argumentHint"] as? String ?? ""
        source = o["source"] as? String ?? ""
    }
}

struct StatusEntry: Identifiable {
    let key: String
    let value: String // Running | Done | Waiting | Error
    let priority: Int
    let timestamp: Int

    var id: String { key }

    init(_ o: [String: Any]) {
        key = o["key"] as? String ?? ""
        value = o["value"] as? String ?? ""
        priority = o["priority"] as? Int ?? 0
        timestamp = o["timestamp"] as? Int ?? 0
    }
}

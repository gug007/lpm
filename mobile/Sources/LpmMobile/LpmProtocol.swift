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
    static func status(project: String) -> String { json(["t": "status", "project": project]) }
    static func sub(id: String) -> String { json(["t": "sub", "id": id]) }
    static func unsub(id: String) -> String { json(["t": "unsub", "id": id]) }
    static func input(id: String, data: String) -> String { json(["t": "in", "id": id, "d": data]) }
    static func resize(id: String, cols: Int, rows: Int) -> String {
        json(["t": "resize", "id": id, "cols": cols, "rows": rows])
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

    var id: String { name }

    init(_ o: [String: Any]) {
        name = o["name"] as? String ?? ""
        label = Wire.label(o, fallback: "name")
        running = o["running"] as? Bool ?? false
        isRemote = o["isRemote"] as? Bool ?? false
        statusEntries = (o["statusEntries"] as? [[String: Any]] ?? []).map(StatusEntry.init)
        services = (o["services"] as? [[String: Any]] ?? []).map(Service.init)
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

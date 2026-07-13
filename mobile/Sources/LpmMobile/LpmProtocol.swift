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
    /// An upload carrying a per-upload `reqId` (UUID) the server echoes back, so the
    /// phone matches each reply to its chip independent of order (uploads run on a
    /// worker thread). `name` saves the blob under its original basename (files).
    static func upload(id: String, data: String, mime: String, name: String?, reqId: String) -> String {
        var obj: [String: Any] = ["t": "upload", "id": id, "data": data, "mime": mime, "reqId": reqId]
        if let name, !name.isEmpty { obj["name"] = name }
        return json(obj)
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
    /// Take control of a terminal shown live elsewhere (the "Take control" button).
    static func claim(id: String) -> String { json(["t": "claim", "id": id]) }
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
    static func closeTerminal(project: String, id: String) -> String {
        json(["t": "closeTerminal", "project": project, "id": id])
    }
    static func renameTerminal(project: String, id: String, label: String) -> String {
        json(["t": "renameTerminal", "project": project, "id": id, "label": label])
    }
    static func pinTerminal(project: String, id: String) -> String {
        json(["t": "pinTerminal", "project": project, "id": id])
    }
    static func reorderTerminals(project: String, order: [String]) -> String {
        json(["t": "reorderTerminals", "project": project, "order": order])
    }
    static func duplicate(name: String, options: DuplicateOptions) -> String {
        let trim = { (s: String) in s.trimmingCharacters(in: .whitespacesAndNewlines) }
        var obj: [String: Any] = [
            "t": "duplicate",
            "name": name,
            "count": options.count,
            "labels": options.labels.prefix(options.count).map(trim),
            "excludeUncommitted": options.excludeUncommitted,
            "reinstallDeps": options.reinstallDeps,
            "pullLatest": options.pullLatest,
            "groupName": trim(options.groupName),
            "runMode": options.runMode.rawValue,
        ]
        switch options.runMode {
        case .action: obj["action"] = options.actionName
        case .command: obj["command"] = trim(options.command)
        case .none: break
        }
        if options.runMode != .none {
            let p = trim(options.prompt)
            if !p.isEmpty { obj["prompt"] = p }
        }
        return json(obj)
    }
    static func duplicateDefaults() -> String { json(["t": "duplicateDefaults"]) }
    static func remove(name: String) -> String { json(["t": "remove", "name": name]) }
    static func start(name: String, profile: String = "") -> String {
        json(["t": "start", "name": name, "profile": profile])
    }
    static func stop(name: String) -> String { json(["t": "stop", "name": name]) }
    static func toggleService(name: String, service: String) -> String {
        json(["t": "toggleService", "name": name, "service": service])
    }
    static func ping() -> String { json(["t": "ping"]) }
    /// Register (or refresh) this device's push identity. `key` is the base64
    /// AES-256 push key shared with the notification extension.
    static func apnsToken(token: String, env: String, key: String,
                          notifyWaiting: Bool, notifyDone: Bool, notifyError: Bool) -> String {
        json(["t": "apnsToken", "token": token, "env": env, "key": key,
              "notify": ["waiting": notifyWaiting, "done": notifyDone, "error": notifyError]])
    }

    // MARK: git review

    static func git(project: String) -> String { json(["t": "git", "project": project]) }
    static func gitDiff(project: String, path: String) -> String {
        json(["t": "gitDiff", "project": project, "path": path])
    }
    static func gitCommit(project: String, message: String, files: [String]) -> String {
        json(["t": "gitCommit", "project": project, "message": message, "files": files])
    }
    static func gitPush(project: String) -> String { json(["t": "gitPush", "project": project]) }
    static func gitGenMessage(project: String, files: [String]) -> String {
        json(["t": "gitGenMessage", "project": project, "files": files])
    }
    static func gitGenPr(project: String) -> String { json(["t": "gitGenPr", "project": project]) }
    static func gitCreatePr(project: String, title: String, body: String) -> String {
        json(["t": "gitCreatePr", "project": project, "title": title, "body": body])
    }
    static func gitPull(project: String) -> String { json(["t": "gitPull", "project": project]) }
    static func gitFetch(project: String) -> String { json(["t": "gitFetch", "project": project]) }
    static func gitBranches(project: String) -> String { json(["t": "gitBranches", "project": project]) }
    static func gitCheckout(project: String, branch: String, remote: String) -> String {
        json(["t": "gitCheckout", "project": project, "branch": branch, "remote": remote])
    }
    static func gitDiscardAll(project: String) -> String { json(["t": "gitDiscardAll", "project": project]) }
    static func gitWatch(project: String) -> String { json(["t": "gitWatch", "project": project]) }
    static func gitUnwatch(project: String) -> String { json(["t": "gitUnwatch", "project": project]) }

    // MARK: composer parity (AI actions, transform, service logs, rich history)

    static func composerActions() -> String { json(["t": "composerActions"]) }
    static func transform(reqId: String, project: String, instruction: String,
                          text: String, variants: Int) -> String {
        json(["t": "transform", "reqId": reqId, "project": project,
              "instruction": instruction, "text": text, "variants": variants])
    }
    static func services(project: String) -> String { json(["t": "services", "project": project]) }
    static func serviceLogs(project: String, paneIndex: Int, lines: Int) -> String {
        json(["t": "serviceLogs", "project": project, "paneIndex": paneIndex, "lines": lines])
    }
    static func historyQuery(project: String?, search: String?, favoritesOnly: Bool,
                             folder: String?, before: (at: Int, seq: Int)?) -> String {
        var obj: [String: Any] = ["t": "historyQuery"]
        if let project, !project.isEmpty { obj["project"] = project }
        if let search, !search.isEmpty { obj["search"] = search }
        if favoritesOnly { obj["favoritesOnly"] = true }
        if let folder, !folder.isEmpty { obj["folder"] = folder }
        if let before { obj["before"] = ["at": before.at, "seq": before.seq] }
        return json(obj)
    }
    static func historySaveDraft(message: String, project: String?, id: String?,
                                 label: String?, images: [String: String]?) -> String {
        var obj: [String: Any] = ["t": "historySaveDraft", "message": message]
        if let project, !project.isEmpty { obj["project"] = project }
        if let id, !id.isEmpty { obj["id"] = id }
        if let label, !label.isEmpty { obj["label"] = label }
        if let images, !images.isEmpty { obj["images"] = images }
        return json(obj)
    }
    static func historyToggleFavorite(id: String) -> String {
        json(["t": "historyToggleFavorite", "id": id])
    }
    static func historySetFolder(id: String, folder: String?) -> String {
        var obj: [String: Any] = ["t": "historySetFolder", "id": id]
        if let folder, !folder.isEmpty { obj["folder"] = folder }
        return json(obj)
    }
    static func historyDelete(id: String) -> String { json(["t": "historyDelete", "id": id]) }
    static func historyFolders() -> String { json(["t": "historyFolders"]) }
    static func historyCreateFolder(name: String) -> String {
        json(["t": "historyCreateFolder", "name": name])
    }
    static func historyDeleteFolder(id: String?, name: String?) -> String {
        var obj: [String: Any] = ["t": "historyDeleteFolder"]
        if let id, !id.isEmpty { obj["id"] = id }
        if let name, !name.isEmpty { obj["name"] = name }
        return json(obj)
    }

    /// A `transform`/`historyQuery` reqId echoes back verbatim as a string or a
    /// number; normalize either to the string we sent so replies match requests.
    static func reqIdString(_ v: Any?) -> String {
        if let s = v as? String { return s }
        if let n = v as? NSNumber { return n.stringValue }
        return ""
    }

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
        case paired(deviceId: String, token: String, serverId: String?, serverName: String?)
        case ready(serverId: String?, serverName: String?)
        case error(String)
        case projects([Project])
        case sidebar(order: [String], groups: [ProjectFolder])
        case terminals(project: String, [TerminalInfo])
        case slash(id: String, [SlashCommand])
        case mentions(project: String, [MentionEntry])
        case history(project: String, [HistoryRow])
        case upload(id: String, reqId: String, path: String)
        case status(project: String, [StatusEntry])
        case seed(id: String, cols: Int, rows: Int, data: String, owner: ControlOwner?)
        case control(id: String, owner: ControlOwner?)
        case output(id: String, data: String)
        case exit(id: String, code: Int)
        // A duplicate/remove reply. `error` is nil on success; `name` is the new
        // duplicate's name (duplicate only). The projects list refreshes off the
        // `projects-changed` push, so these carry only the failure to surface.
        // A per-copy progress tick while a duplicate batch runs.
        case duplicateProgress(done: Int, total: Int, name: String)
        // The final duplicate result. `error` is nil on success; `warning` is a
        // non-fatal note (e.g. copies made but the run task needs the Mac app open).
        case duplicate(name: String, error: String?, warning: String?)
        // The desktop's persisted duplicate-modal toggle defaults.
        case duplicateDefaults(excludeUncommitted: Bool, reinstallDeps: Bool, pullLatest: Bool)
        case remove(error: String?)
        // A runAction/newTerminal request the Mac couldn't execute (e.g. the
        // app isn't open there). Success acks carry nothing and stay .unknown.
        case actionFailed(project: String, error: String)
        case projectsChanged
        case statusChanged(project: String)
        // Git review replies. Each carries the project it belongs to; `error` is
        // nil on success. `git` returns nil snapshot only on a hard failure — a
        // non-repo is a successful snapshot with isRepo == false.
        case git(project: String, snapshot: GitSnapshot?, error: String?)
        case gitDiff(project: String, path: String, diff: String, binary: Bool, truncated: Bool, error: String?)
        case gitCommit(project: String, error: String?)
        case gitPush(project: String, error: String?)
        case gitGenMessage(project: String, message: String?, error: String?)
        case gitGenPr(project: String, title: String?, body: String?, error: String?)
        case gitCreatePr(project: String, url: String?, error: String?)
        case gitPull(project: String, error: String?)
        case gitFetch(project: String, error: String?)
        case gitBranches(project: String, current: String, branches: [GitBranch], error: String?)
        case gitCheckout(project: String, error: String?)
        case gitDiscardAll(project: String, error: String?)
        // Server push: watched files changed for this project (already debounced).
        case gitChanged(project: String)
        // Ack for an apnsToken registration.
        case apnsToken(ok: Bool)
        // Composer parity replies.
        case composerActions([ComposerAction])
        // One transform variant settled (`text` on success, `error` on failure);
        // `reqId` matches it to the request, `idx` to the variant slot.
        case transformVariant(reqId: String, idx: Int, text: String?, error: String?)
        // The transform batch finished; `ok` is true if any variant succeeded.
        case transformDone(reqId: String, ok: Bool)
        case services(project: String, running: Bool, services: [ServiceInfo], error: String?)
        case serviceLogs(project: String, paneIndex: Int, text: String?, error: String?)
        case historyQuery(items: [HistoryItem], hasMore: Bool)
        case historySaveDraft(ok: Bool)
        case historyToggleFavorite(id: String, favorite: Bool, error: String?)
        // setFolder / delete / deleteFolder acks don't echo an id, so the UI updates
        // optimistically and treats these as confirm-or-refresh signals.
        case historyMutated(ok: Bool, error: String?)
        case historyFolders([HistoryFolder])
        case historyCreateFolder(folder: HistoryFolder?, error: String?)
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
                               token: obj["token"] as? String ?? "",
                               serverId: obj["serverId"] as? String,
                               serverName: obj["serverName"] as? String)
            case "ready":
                return .ready(serverId: obj["serverId"] as? String,
                              serverName: obj["serverName"] as? String)
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
                               reqId: Wire.reqIdString(obj["reqId"]),
                               path: ok ? (obj["path"] as? String ?? "") : "")
            case "status":
                return .status(project: obj["project"] as? String ?? "",
                               (obj["status"] as? [[String: Any]] ?? []).map(StatusEntry.init))
            case "seed":
                return .seed(id: obj["id"] as? String ?? "",
                             cols: obj["cols"] as? Int ?? 80,
                             rows: obj["rows"] as? Int ?? 24,
                             data: obj["data"] as? String ?? "",
                             owner: ControlOwner(obj["owner"]))
            case "control":
                return .control(id: obj["id"] as? String ?? "",
                                owner: ControlOwner(obj["owner"]))
            case "o":
                return .output(id: obj["id"] as? String ?? "", data: obj["d"] as? String ?? "")
            case "exit":
                return .exit(id: obj["id"] as? String ?? "", code: obj["code"] as? Int ?? 0)
            case "duplicateProgress":
                return .duplicateProgress(done: obj["done"] as? Int ?? 0,
                                          total: obj["total"] as? Int ?? 0,
                                          name: obj["name"] as? String ?? "")
            case "duplicate":
                let ok = obj["ok"] as? Bool ?? false
                return .duplicate(name: obj["name"] as? String ?? "",
                                  error: ok ? nil : (obj["error"] as? String ?? "Couldn't duplicate the project."),
                                  warning: obj["warning"] as? String)
            case "duplicateDefaults":
                return .duplicateDefaults(
                    excludeUncommitted: obj["excludeUncommitted"] as? Bool ?? false,
                    reinstallDeps: obj["reinstallDeps"] as? Bool ?? false,
                    pullLatest: obj["pullLatest"] as? Bool ?? true)
            case "remove":
                let ok = obj["ok"] as? Bool ?? false
                return .remove(error: ok ? nil : (obj["error"] as? String ?? "Couldn't remove the project."))
            case "runAction", "newTerminal":
                if obj["ok"] as? Bool ?? true { return .unknown }
                return .actionFailed(project: obj["project"] as? String ?? "",
                                     error: obj["error"] as? String ?? "Couldn't reach the lpm app on your Mac.")
            case "projects-changed": return .projectsChanged
            case "status-changed": return .statusChanged(project: obj["project"] as? String ?? "")
            case "git":
                let ok = obj["ok"] as? Bool ?? false
                return .git(project: obj["project"] as? String ?? "",
                            snapshot: ok ? GitSnapshot(obj) : nil,
                            error: ok ? nil : (obj["error"] as? String ?? "Couldn't read the repository."))
            case "gitDiff":
                let ok = obj["ok"] as? Bool ?? false
                return .gitDiff(project: obj["project"] as? String ?? "",
                                path: obj["path"] as? String ?? "",
                                diff: obj["diff"] as? String ?? "",
                                binary: obj["binary"] as? Bool ?? false,
                                truncated: obj["truncated"] as? Bool ?? false,
                                error: ok ? nil : (obj["error"] as? String ?? "Couldn't load the diff."))
            case "gitCommit":
                let ok = obj["ok"] as? Bool ?? false
                return .gitCommit(project: obj["project"] as? String ?? "",
                                  error: ok ? nil : (obj["error"] as? String ?? "Couldn't commit."))
            case "gitPush":
                let ok = obj["ok"] as? Bool ?? false
                return .gitPush(project: obj["project"] as? String ?? "",
                                error: ok ? nil : (obj["error"] as? String ?? "Couldn't push."))
            case "gitGenMessage":
                let ok = obj["ok"] as? Bool ?? false
                return .gitGenMessage(project: obj["project"] as? String ?? "",
                                      message: ok ? (obj["message"] as? String ?? "") : nil,
                                      error: ok ? nil : (obj["error"] as? String ?? "Couldn't generate a message."))
            case "gitGenPr":
                let ok = obj["ok"] as? Bool ?? false
                return .gitGenPr(project: obj["project"] as? String ?? "",
                                 title: ok ? (obj["title"] as? String ?? "") : nil,
                                 body: ok ? (obj["body"] as? String ?? "") : nil,
                                 error: ok ? nil : (obj["error"] as? String ?? "Couldn't draft the pull request."))
            case "gitCreatePr":
                let ok = obj["ok"] as? Bool ?? false
                return .gitCreatePr(project: obj["project"] as? String ?? "",
                                    url: ok ? (obj["url"] as? String ?? "") : nil,
                                    error: ok ? nil : (obj["error"] as? String ?? "Couldn't create the pull request."))
            case "gitPull":
                let ok = obj["ok"] as? Bool ?? false
                return .gitPull(project: obj["project"] as? String ?? "",
                                error: ok ? nil : (obj["error"] as? String ?? "Couldn't pull."))
            case "gitFetch":
                let ok = obj["ok"] as? Bool ?? false
                return .gitFetch(project: obj["project"] as? String ?? "",
                                 error: ok ? nil : (obj["error"] as? String ?? "Couldn't fetch."))
            case "gitBranches":
                let ok = obj["ok"] as? Bool ?? false
                return .gitBranches(project: obj["project"] as? String ?? "",
                                    current: obj["current"] as? String ?? "",
                                    branches: ok ? (obj["branches"] as? [[String: Any]] ?? []).map(GitBranch.init) : [],
                                    error: ok ? nil : (obj["error"] as? String ?? "Couldn't list branches."))
            case "gitCheckout":
                let ok = obj["ok"] as? Bool ?? false
                return .gitCheckout(project: obj["project"] as? String ?? "",
                                    error: ok ? nil : (obj["error"] as? String ?? "Couldn't switch branch."))
            case "gitDiscardAll":
                let ok = obj["ok"] as? Bool ?? false
                return .gitDiscardAll(project: obj["project"] as? String ?? "",
                                      error: ok ? nil : (obj["error"] as? String ?? "Couldn't discard changes."))
            case "git-changed": return .gitChanged(project: obj["project"] as? String ?? "")
            case "apnsToken": return .apnsToken(ok: obj["ok"] as? Bool ?? false)
            case "composerActions":
                return .composerActions((obj["actions"] as? [[String: Any]] ?? []).map(ComposerAction.init))
            case "transform":
                let ok = obj["ok"] as? Bool ?? false
                return .transformVariant(reqId: Wire.reqIdString(obj["reqId"]),
                                         idx: obj["idx"] as? Int ?? 0,
                                         text: ok ? (obj["text"] as? String ?? "") : nil,
                                         error: ok ? nil : (obj["error"] as? String ?? "The rewrite failed."))
            case "transformDone":
                return .transformDone(reqId: Wire.reqIdString(obj["reqId"]), ok: obj["ok"] as? Bool ?? false)
            case "services":
                let ok = obj["ok"] as? Bool ?? false
                return .services(project: obj["project"] as? String ?? "",
                                 running: obj["running"] as? Bool ?? false,
                                 services: ok ? (obj["services"] as? [[String: Any]] ?? []).map(ServiceInfo.init) : [],
                                 error: ok ? nil : (obj["error"] as? String ?? "Couldn't read services."))
            case "serviceLogs":
                let ok = obj["ok"] as? Bool ?? false
                return .serviceLogs(project: obj["project"] as? String ?? "",
                                    paneIndex: obj["paneIndex"] as? Int ?? 0,
                                    text: ok ? (obj["text"] as? String ?? "") : nil,
                                    error: ok ? nil : (obj["error"] as? String ?? "Couldn't read the logs."))
            case "historyQuery":
                return .historyQuery(items: (obj["items"] as? [[String: Any]] ?? []).map(HistoryItem.init),
                                     hasMore: obj["hasMore"] as? Bool ?? false)
            case "historySaveDraft":
                return .historySaveDraft(ok: obj["ok"] as? Bool ?? false)
            case "historyToggleFavorite":
                let ok = obj["ok"] as? Bool ?? false
                return .historyToggleFavorite(id: obj["id"] as? String ?? "",
                                              favorite: obj["favorite"] as? Bool ?? false,
                                              error: ok ? nil : (obj["error"] as? String ?? "Couldn't update favorite."))
            case "historySetFolder", "historyDelete", "historyDeleteFolder":
                let ok = obj["ok"] as? Bool ?? false
                return .historyMutated(ok: ok, error: ok ? nil : (obj["error"] as? String ?? "Couldn't update history."))
            case "historyFolders":
                return .historyFolders((obj["folders"] as? [[String: Any]] ?? []).map(HistoryFolder.init))
            case "historyCreateFolder":
                let ok = obj["ok"] as? Bool ?? false
                return .historyCreateFolder(
                    folder: ok ? HistoryFolder(obj["folder"] as? [String: Any] ?? [:]) : nil,
                    error: ok ? nil : (obj["error"] as? String ?? "Couldn't create the folder."))
            case "pong": return .pong
            default: return .unknown
            }
        }
    }
}

/// Which surface currently owns (renders live + drives the size of) a terminal.
/// A terminal is controllable in exactly one place at a time; when the desktop
/// (or another phone) owns it, this phone shows a "take control" placeholder.
/// `kind` is "window" or "mobile"; equality is on (kind, id).
struct ControlOwner: Equatable {
    let kind: String
    let id: String
    let label: String

    /// Parses the `owner` field (an object, or null when nobody owns it).
    init?(_ o: Any?) {
        guard let d = o as? [String: Any] else { return nil }
        kind = d["kind"] as? String ?? ""
        id = d["id"] as? String ?? ""
        label = d["label"] as? String ?? ""
    }
}

struct Project: Identifiable {
    let name: String
    let label: String
    let running: Bool
    let isRemote: Bool
    // The project this is a duplicate of; empty for originals. Drives whether the
    // phone offers "Remove" (only duplicates, whose folders are deleted on remove).
    let parentName: String
    let statusEntries: [StatusEntry]
    let services: [Service]      // currently running
    let allServices: [Service]   // every configured service
    let profiles: [Profile]
    let activeProfile: String
    let actions: [Action]

    var id: String { name }
    var isDuplicate: Bool { !parentName.isEmpty }

    init(_ o: [String: Any]) {
        name = o["name"] as? String ?? ""
        label = Wire.label(o, fallback: "name")
        running = o["running"] as? Bool ?? false
        isRemote = o["isRemote"] as? Bool ?? false
        parentName = o["parentName"] as? String ?? ""
        statusEntries = (o["statusEntries"] as? [[String: Any]] ?? []).map(StatusEntry.init)
        services = (o["services"] as? [[String: Any]] ?? []).map(Service.init)
        allServices = (o["allServices"] as? [[String: Any]] ?? []).map(Service.init)
        profiles = (o["profiles"] as? [[String: Any]] ?? []).map(Profile.init)
        activeProfile = o["activeProfile"] as? String ?? ""
        actions = (o["actions"] as? [[String: Any]] ?? []).map(Action.init)
    }

    private init(name: String, label: String, running: Bool, isRemote: Bool, parentName: String,
                 statusEntries: [StatusEntry], services: [Service], allServices: [Service],
                 profiles: [Profile], activeProfile: String, actions: [Action]) {
        self.name = name; self.label = label; self.running = running; self.isRemote = isRemote
        self.parentName = parentName
        self.statusEntries = statusEntries; self.services = services; self.allServices = allServices
        self.profiles = profiles; self.activeProfile = activeProfile; self.actions = actions
    }

    /// A copy with fresh status — used by the status-changed push, which must not
    /// erase the project's services/actions (a partial dict rebuild would).
    func withStatus(_ entries: [StatusEntry]) -> Project {
        Project(name: name, label: label, running: running, isRemote: isRemote, parentName: parentName,
                statusEntries: entries, services: services, allServices: allServices,
                profiles: profiles, activeProfile: activeProfile, actions: actions)
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
    let port: Int
    var id: String { name }
    init(_ o: [String: Any]) {
        name = o["name"] as? String ?? ""
        port = o["port"] as? Int ?? 0
    }
}

/// A named bundle of services (mirrors the desktop ProfileInfo). Starting a profile
/// runs exactly its listed services.
struct Profile: Identifiable {
    let name: String
    let services: [String]
    var id: String { name }
    init(_ o: [String: Any]) {
        name = o["name"] as? String ?? ""
        services = o["services"] as? [String] ?? []
    }
}

struct TerminalInfo: Identifiable, Hashable {
    let id: String
    let label: String
    let project: String
    let cols: Int
    let rows: Int
    let remote: Bool
    let pinned: Bool
    let emoji: String
    // The AI CLI this terminal runs (e.g. "claude"), as detected by the desktop;
    // empty for a plain shell or an older server.
    let cli: String

    init(_ o: [String: Any]) {
        id = o["id"] as? String ?? ""
        // The desktop tab name; falls back to the id for older servers.
        label = Wire.label(o, fallback: "id")
        project = o["project"] as? String ?? ""
        cols = o["cols"] as? Int ?? 80
        rows = o["rows"] as? Int ?? 24
        remote = o["remote"] as? Bool ?? false
        pinned = o["pinned"] as? Bool ?? false
        emoji = o["emoji"] as? String ?? ""
        cli = o["cli"] as? String ?? ""
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

/// One changed file in the working tree (mirrors the desktop git status row).
/// `status` is one of added | deleted | renamed | modified | untracked.
struct GitFile: Identifiable, Hashable {
    let path: String
    let status: String
    let staged: Bool
    // Opaque change token from the server; may be absent on older servers (treated
    // as "changed" by the live-refresh comparison).
    let stamp: String

    var id: String { path }

    init(_ o: [String: Any]) {
        path = o["path"] as? String ?? ""
        status = o["status"] as? String ?? "modified"
        staged = o["staged"] as? Bool ?? false
        stamp = o["stamp"] as? String ?? ""
    }
}

/// A repository snapshot for the review screen: the branch and its relation to the
/// upstream, whether the GitHub CLI is available for PRs, and the changed files.
/// `isRepo` false is a valid snapshot (the project just isn't a git repo).
struct GitSnapshot {
    let isRepo: Bool
    let branch: String
    let detached: Bool
    let hasUpstream: Bool
    let ahead: Int
    let behind: Int
    let defaultBranch: String
    let ghCli: Bool
    let files: [GitFile]

    init(_ o: [String: Any]) {
        isRepo = o["isRepo"] as? Bool ?? false
        branch = o["branch"] as? String ?? ""
        detached = o["detached"] as? Bool ?? false
        hasUpstream = o["hasUpstream"] as? Bool ?? false
        ahead = o["ahead"] as? Int ?? 0
        behind = o["behind"] as? Int ?? 0
        defaultBranch = o["defaultBranch"] as? String ?? ""
        ghCli = o["ghCli"] as? Bool ?? false
        files = (o["files"] as? [[String: Any]] ?? []).map(GitFile.init)
    }
}

/// A single file's unified diff, ready for the review screen to parse and render.
struct GitDiffResult {
    let diff: String
    let binary: Bool
    let truncated: Bool
}

/// A branch offered in the switch-branch sheet. `remote` is the remote name for a
/// remote-only branch (e.g. "origin") and empty for a local branch.
struct GitBranch: Identifiable, Hashable {
    let name: String
    let committerDate: String
    let remote: String

    var id: String { remote.isEmpty ? name : remote + "/" + name }
    var isRemote: Bool { !remote.isEmpty }

    init(_ o: [String: Any]) {
        name = o["name"] as? String ?? ""
        committerDate = o["committerDate"] as? String ?? ""
        remote = o["remote"] as? String ?? ""
    }
}

/// One enabled composer AI action (from `~/.lpm/composer-actions.json`). `icon` is
/// a stable key the phone maps to an SF Symbol; `id` is passed back as the
/// `transform` instruction source, `label` is the menu title.
struct ComposerAction: Identifiable {
    let id: String
    let icon: String
    let label: String
    let instruction: String

    init(_ o: [String: Any]) {
        id = o["id"] as? String ?? ""
        icon = o["icon"] as? String ?? ""
        label = o["label"] as? String ?? ""
        instruction = o["instruction"] as? String ?? ""
    }
}

/// One service in the logs viewer. `paneIndex` is the index to pass to
/// `serviceLogs` when the project is running (nil when stopped).
struct ServiceInfo: Identifiable {
    let name: String
    let paneIndex: Int?
    let running: Bool
    let cmd: String
    let port: Int

    var id: String { name }

    init(_ o: [String: Any]) {
        name = o["name"] as? String ?? ""
        paneIndex = o["paneIndex"] as? Int
        running = o["running"] as? Bool ?? false
        cmd = o["cmd"] as? String ?? ""
        port = o["port"] as? Int ?? 0
    }
}

/// One message-history row for the paged history screen. `kind` is "sent" or
/// "draft"; `at`/`seq` form the keyset cursor for the next page. `favorite` and
/// `folder` are `var` so the screen can update them optimistically in place.
struct HistoryItem: Identifiable {
    let id: String
    let text: String
    let images: [String: String]
    let timestamp: Int
    var favorite: Bool
    var folder: String?
    let kind: String
    let project: String
    let at: Int
    let seq: Int

    var isDraft: Bool { kind == "draft" }

    init(_ o: [String: Any]) {
        id = o["id"] as? String ?? ""
        text = o["text"] as? String ?? ""
        images = o["images"] as? [String: String] ?? [:]
        timestamp = o["timestamp"] as? Int ?? 0
        favorite = o["favorite"] as? Bool ?? false
        folder = o["folder"] as? String
        kind = o["kind"] as? String ?? "sent"
        project = o["project"] as? String ?? ""
        at = o["at"] as? Int ?? 0
        seq = o["seq"] as? Int ?? 0
    }
}

/// A message-history folder with its message count, for the history filter UI.
struct HistoryFolder: Identifiable {
    let id: String
    let name: String
    let count: Int

    init(_ o: [String: Any]) {
        id = o["id"] as? String ?? ""
        name = o["name"] as? String ?? "Folder"
        count = o["count"] as? Int ?? 0
    }
}

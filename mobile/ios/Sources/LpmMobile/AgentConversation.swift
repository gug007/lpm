import Foundation

/// One entry of an agent tab's conversation, as the Mac reads it from the
/// transcript the agent keeps (PROTOCOL.md, An agent's conversation). `id` stays
/// the same while the entry changes: a tool call that finishes.
struct ConversationItem: Identifiable, Equatable {
    enum Kind: Equatable {
        case prompt(text: String, images: Int)
        case text(String)
        case tool(ConversationTool)
        case notice(String)
    }

    let id: String
    let kind: Kind

    var tool: ConversationTool? {
        if case .tool(let tool) = kind { return tool }
        return nil
    }

    var isPrompt: Bool {
        if case .prompt = kind { return true }
        return false
    }

    init?(_ o: [String: Any]) {
        guard let id = o["id"] as? String, !id.isEmpty else { return nil }
        self.id = id
        let text = o["text"] as? String ?? ""
        switch o["kind"] as? String {
        case "prompt": kind = .prompt(text: text, images: o["images"] as? Int ?? 0)
        case "text": kind = .text(text)
        case "tool": kind = .tool(ConversationTool(o))
        case "notice": kind = .notice(text)
        default: return nil
        }
    }
}

/// One thing the agent did, worded by the Mac to read as a line.
struct ConversationTool: Equatable {
    enum State: String { case running, done, failed }

    let what: String
    let verb: String
    let subject: String
    /// The subject is a name or a command rather than words.
    let code: Bool
    /// The file it was about, to open.
    let path: String
    let added: Int?
    let removed: Int?
    let note: String
    let state: State

    /// Reading or searching: a run of these folds into one line.
    var isLookup: Bool { what == "read" || what == "search" }

    init(_ o: [String: Any]) {
        what = o["what"] as? String ?? ""
        verb = o["verb"] as? String ?? ""
        subject = o["subject"] as? String ?? ""
        code = o["code"] as? Bool ?? false
        path = o["path"] as? String ?? ""
        added = o["added"] as? Int
        removed = o["removed"] as? Int
        note = o["note"] as? String ?? ""
        state = State(rawValue: o["state"] as? String ?? "") ?? .done
    }
}

/// What a tool call was given or what came back, under its opened line.
struct ConversationPart: Equatable {
    enum Style: String { case code, diff, markdown }

    let label: String
    let style: Style
    let text: String

    init(_ o: [String: Any]) {
        label = o["label"] as? String ?? ""
        style = Style(rawValue: o["style"] as? String ?? "") ?? .code
        text = o["text"] as? String ?? ""
    }
}

/// The conversation as it's drawn: each entry its own row, but for a run of reads
/// and searches, which is one.
enum ConversationRow: Identifiable, Equatable {
    case item(ConversationItem)
    case lookups([ConversationItem])

    var id: String {
        switch self {
        case .item(let item): return item.id
        case .lookups(let items): return "lookups:" + (items.first?.id ?? "")
        }
    }

    static func rows(_ items: [ConversationItem]) -> [ConversationRow] {
        var rows: [ConversationRow] = []
        var run: [ConversationItem] = []
        func flush() {
            if run.count > 1 { rows.append(.lookups(run)) } else { rows += run.map(ConversationRow.item) }
            run = []
        }
        for item in items {
            if item.tool?.isLookup == true {
                run.append(item)
            } else {
                flush()
                rows.append(.item(item))
            }
        }
        flush()
        return rows
    }
}

/// "Read 3 files", "Searched twice", "Read 2 files, searched once" — or what the
/// last call is at while the agent is still going.
func lookupsLabel(_ items: [ConversationItem], live: Bool) -> String {
    let calls = items.compactMap(\.tool)
    if live, let last = calls.last, last.state == .running {
        return last.what == "read" ? "Reading…" : "Searching…"
    }
    let reads = calls.filter { $0.what == "read" }.count
    let searches = calls.count - reads
    let times = searches == 1 ? "once" : searches == 2 ? "twice" : "\(searches) times"
    if reads == 0 { return "Searched \(times)" }
    let read = reads == 1 ? "Read 1 file" : "Read \(reads) files"
    return searches == 0 ? read : "\(read), searched \(times)"
}

/// What the Mac pushes of a watched conversation.
struct ConversationUpdate {
    let id: String
    /// The newest entries rather than what changed since.
    let reset: Bool
    let items: [ConversationItem]
    let more: Bool
    let error: String?

    init(_ o: [String: Any]) {
        id = o["id"] as? String ?? ""
        reset = o["reset"] as? Bool ?? false
        items = (o["items"] as? [[String: Any]] ?? []).compactMap(ConversationItem.init)
        more = o["more"] as? Bool ?? false
        error = o["ok"] as? Bool == true
            ? nil : (o["error"] as? String ?? "Couldn't read the conversation.")
    }
}

/// The entries before one, oldest first.
struct ConversationPage {
    let items: [ConversationItem]
    let more: Bool

    init(_ o: [String: Any]) {
        items = (o["items"] as? [[String: Any]] ?? []).compactMap(ConversationItem.init)
        more = o["more"] as? Bool ?? false
    }
}

extension Wire {
    static func conversationWatch(id: String, project: String) -> String {
        json(["t": "conversationWatch", "id": id, "project": project])
    }
    static func conversationUnwatch(id: String) -> String {
        json(["t": "conversationUnwatch", "id": id])
    }
    static func conversationPage(id: String, project: String, before: String, reqId: String) -> String {
        json(["t": "conversationPage", "id": id, "project": project, "before": before, "reqId": reqId])
    }
    static func conversationDetail(id: String, project: String, item: String, reqId: String) -> String {
        json(["t": "conversationDetail", "id": id, "project": project, "item": item, "reqId": reqId])
    }
}

import Foundation

// The person-set work status on a duplicate — "what I want done with this copy",
// as opposed to StatusEntry, which is what the agent is doing. Mirrors the
// desktop's src/workStatus.ts so both surfaces read a status the same way, and
// the Mac's set_work_status, so the row the phone paints before the reply lands
// is the row the Mac writes. See ../../PROTOCOL.md.

enum WorkState: String {
    case inProgress = "in_progress"
    case blocked
    case done
    case custom
}

private extension WorkState {
    /// Nil for `custom`, the one state that carries its own name and mark so a
    /// row still reads on a Mac whose palette differs.
    var builtInLabel: String? {
        switch self {
        case .inProgress: return "In progress"
        case .blocked: return "Blocked"
        case .done: return "Done"
        case .custom: return nil
        }
    }
    var builtInEmoji: String? {
        switch self {
        case .inProgress: return "⏳"
        case .blocked: return "⛔"
        case .done: return "✅"
        case .custom: return nil
        }
    }
}

private func trimmed(_ value: Any?) -> String? {
    guard let s = value as? String else { return nil }
    let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
    return t.isEmpty ? nil : t
}

/// The status on a project, as the Mac stores it. `label`/`emoji` describe a
/// custom status only; `since` is unix millis, 0 when the Mac wrote no clock.
struct WorkStatus: Equatable {
    let state: WorkState
    let label: String?
    let emoji: String?
    let note: String?
    let since: Int

    init(state: WorkState, label: String?, emoji: String?, note: String?, since: Int) {
        self.state = state
        self.label = label
        self.emoji = emoji
        self.note = note
        self.since = since
    }

    /// Nil for a state this build doesn't know, or a custom status with no name —
    /// the same two rules that make the Mac drop the key.
    init?(_ o: [String: Any]) {
        guard let state = WorkState(rawValue: o["state"] as? String ?? "") else { return nil }
        let custom = state == .custom
        let label = custom ? trimmed(o["label"]) : nil
        if custom && label == nil { return nil }
        self.init(state: state,
                  label: label,
                  emoji: custom ? trimmed(o["emoji"]) : nil,
                  note: trimmed(o["note"]),
                  since: (o["since"] as? NSNumber)?.intValue ?? 0)
    }

    var displayLabel: String { state.builtInLabel ?? label ?? "" }
    var displayEmoji: String { state.builtInEmoji ?? emoji ?? "" }
    /// The one rule for "the same status": the state, and the label when custom.
    var key: String { state == .custom ? "custom:\(label ?? "")" : state.rawValue }
}

/// One of the user's own statuses, from the Mac's palette.
struct CustomWorkStatus: Equatable, Identifiable {
    let label: String
    let emoji: String
    let withNote: Bool

    var id: String { label }

    init(label: String, emoji: String, withNote: Bool = false) {
        self.label = label
        self.emoji = emoji
        self.withNote = withNote
    }

    init?(_ o: [String: Any]) {
        guard let label = trimmed(o["label"]) else { return nil }
        self.init(label: label,
                  emoji: o["emoji"] as? String ?? "",
                  withNote: o["withNote"] as? Bool ?? false)
    }
}

/// What applying a menu row asks the Mac for; the Mac stamps `since`.
struct WorkStatusInput: Equatable {
    var state: WorkState
    var label: String?
    var emoji: String?
    var note: String?

    init(state: WorkState, label: String? = nil, emoji: String? = nil, note: String? = nil) {
        self.state = state
        self.label = label
        self.emoji = emoji
        self.note = note
    }

    var wire: [String: Any] {
        var o: [String: Any] = ["state": state.rawValue]
        if let label = trimmed(label) { o["label"] = label }
        if let emoji = trimmed(emoji) { o["emoji"] = emoji }
        if let note = trimmed(note) { o["note"] = note }
        return o
    }

    var key: String { state == .custom ? "custom:\(label ?? "")" : state.rawValue }

    /// The status this input becomes, or nil when it names nothing: a custom
    /// status with no label is no status at all.
    fileprivate var normalized: WorkStatusInput? {
        let custom = state == .custom
        let label = custom ? trimmed(label) : nil
        if custom && label == nil { return nil }
        return WorkStatusInput(state: state,
                               label: label,
                               emoji: custom ? trimmed(emoji) : nil,
                               note: trimmed(note))
    }
}

/// One row of the Status menu: what it applies, how it reads, and whether
/// applying it asks for a line first.
struct WorkStatusChoice: Identifiable, Equatable {
    let input: WorkStatusInput
    let label: String
    let emoji: String
    let asksNote: Bool

    var id: String { input.key }
}

private func builtInChoice(_ state: WorkState) -> WorkStatusChoice {
    WorkStatusChoice(input: WorkStatusInput(state: state),
                     label: state.builtInLabel ?? "",
                     emoji: state.builtInEmoji ?? "",
                     asksNote: state == .blocked)
}

func workStatusChoice(_ entry: CustomWorkStatus) -> WorkStatusChoice {
    WorkStatusChoice(input: WorkStatusInput(state: .custom, label: entry.label, emoji: entry.emoji),
                     label: entry.label,
                     emoji: entry.emoji,
                     asksNote: entry.withNote)
}

/// The states the menu always offers. Everything else in it is the Mac's
/// palette, which the user can edit down to nothing.
let builtInWorkStatuses: [WorkStatusChoice] = [
    builtInChoice(.inProgress),
    builtInChoice(.blocked),
    builtInChoice(.done),
]

/// The five statuses every Mac ships beside the built-in states, and what the
/// phone assumes of a Mac too old to send them.
let defaultWorkStatusPalette: [CustomWorkStatus] = [
    CustomWorkStatus(label: "Review", emoji: "👀", withNote: true),
    CustomWorkStatus(label: "Ready", emoji: "🚀"),
    CustomWorkStatus(label: "Waiting", emoji: "⏰", withNote: true),
    CustomWorkStatus(label: "Needs decision", emoji: "❓", withNote: true),
    CustomWorkStatus(label: "Paused", emoji: "⏸️", withNote: true),
]

// Where the copy is in its life in the order it moves through them, then why it
// is not moving; the user can reorder the menu, so this is only the default.
let defaultWorkStatusOrder: [String] = [
    WorkState.inProgress.rawValue,
    "custom:Review",
    "custom:Ready",
    WorkState.done.rawValue,
    WorkState.blocked.rawValue,
    "custom:Waiting",
    "custom:Needs decision",
    "custom:Paused",
]

/// The Status menu: the built-in states and the Mac's palette, in the order the
/// user dragged them into. A status the order says nothing about keeps its
/// default place, after the ones it does.
func workStatusMenu(palette: [CustomWorkStatus], order: [String]) -> [WorkStatusChoice] {
    let choices = builtInWorkStatuses + palette.map(workStatusChoice)
    let ranked = order.isEmpty ? defaultWorkStatusOrder : order
    var rank: [String: Int] = [:]
    for (i, key) in ranked.enumerated() where rank[key] == nil { rank[key] = i }
    return choices.enumerated()
        .sorted { a, b in
            let ra = rank[a.element.id] ?? Int.max, rb = rank[b.element.id] ?? Int.max
            return ra == rb ? a.offset < b.offset : ra < rb
        }
        .map(\.element)
}

func sameWorkStatus(_ current: WorkStatus?, _ input: WorkStatusInput) -> Bool {
    current?.key == input.key
}

/// The note already on the row, when the choice keeps the same status — so
/// re-applying it edits the line rather than starting from blank.
func existingNote(for current: WorkStatus?, choice: WorkStatusChoice) -> String {
    sameWorkStatus(current, choice.input) ? (current?.note ?? "") : ""
}

/// What the row shows the instant the menu closes, before the Mac confirms. A
/// note-only edit keeps the clock; a change of status restarts it — including
/// when the status on screen carries no clock at all, which is what the Mac does
/// with a hand-written block.
func nextWorkStatus(current: WorkStatus?, input: WorkStatusInput?, now: Int) -> WorkStatus? {
    guard let input else { return nil }
    guard let next = input.normalized else { return current }
    let kept = sameWorkStatus(current, next) ? current?.since ?? 0 : 0
    return WorkStatus(state: next.state,
                      label: next.label,
                      emoji: next.emoji,
                      note: next.note,
                      since: kept == 0 ? now : kept)
}

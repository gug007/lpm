import Foundation

// Wire mirror of the Mac's agent plan-usage snapshot (`limits` / `limits-changed`,
// see ../../PROTOCOL.md) plus the pure card derivations the Usage screen renders.
//
// Two units live inside one object: `resetsAt` is unix SECONDS while `updatedAt`
// is unix MILLIS. Optional fields are omitted from the payload, never null.

/// One tool's latest reading. `accountId` is Claude-only (its per-account config
/// directory, usually "default"); `label` is the Codex plan or the Claude model
/// display name. `updatedAt` is unix millis, so it is read through NSNumber —
/// millisecond timestamps overflow a 32-bit bridge. `noFiveHour` marks a plan
/// with a weekly window and no 5-hour one, whose 5-hour meter is left out.
struct ProviderLimits {
    let provider: String
    let accountId: String?
    let label: String?
    let fiveHour: LimitWindow?
    let weekly: LimitWindow?
    let updatedAt: Int
    let noFiveHour: Bool

    init(_ o: [String: Any]) {
        provider = o["provider"] as? String ?? ""
        accountId = o["accountId"] as? String
        label = o["label"] as? String
        fiveHour = (o["fiveHour"] as? [String: Any]).map(LimitWindow.init)
        weekly = (o["weekly"] as? [String: Any]).map(LimitWindow.init)
        updatedAt = (o["updatedAt"] as? NSNumber)?.intValue ?? 0
        noFiveHour = o["noFiveHour"] as? Bool ?? false
    }
}

/// The whole snapshot: entries keyed "codex" or "claude:<accountId>", plus
/// whether Claude reporting is switched on for this Mac. Without the flag an
/// empty map is ambiguous — a Mac with Claude reporting off never reports Claude
/// windows at all, and the screen has to say so instead of waiting forever.
struct LimitsSnapshot {
    let entries: [String: ProviderLimits]
    let claudeEnabled: Bool

    /// The Mac's own clock when it built this snapshot, unix MILLIS. It anchors
    /// `updatedAt`, which the Mac stamps; `resetsAt` comes from the tool's own
    /// servers and is not on this clock. Nil when the Mac didn't say (an older
    /// Mac) or when what it said isn't a believable wall-clock reading.
    let nowMs: Double?

    init(_ o: [String: Any]) {
        var parsed: [String: ProviderLimits] = [:]
        for (key, value) in o["limits"] as? [String: Any] ?? [:] {
            guard let fields = value as? [String: Any] else { continue }
            parsed[key] = ProviderLimits(fields)
        }
        entries = parsed
        claudeEnabled = o["claudeEnabled"] as? Bool ?? false
        let sent = (o["now"] as? NSNumber)?.doubleValue
        nowMs = sent.flatMap { plausibleNowMsRange.contains($0) ? $0 : nil }
    }
}

/// Millis from 2001 to 2100: anything outside is a zero, a seconds value sent by
/// mistake, or garbage, and shifting the whole screen by it would be worse than
/// trusting the phone's own clock.
private let plausibleNowMsRange: ClosedRange<Double> = 1_000_000_000_000...4_102_444_800_000

/// What the screen says when nothing more specific is known — the wire decode, the
/// request timeout and the store's own fallback all reach for this one string, so
/// the error views can recognise it and drop it rather than repeating it under a
/// heading that already says as much.
let usageGenericError = "Couldn't load usage. Pull to refresh."

/// One card on the Usage screen: a tool's reading with its heading resolved.
struct UsageCard: Identifiable {
    let key: String
    let data: ProviderLimits
    let title: String
    let subtitle: String?
    /// The Claude account the card reads ("default" for the main login).
    var account: String = claudeMainLogin
    /// The earlier account this one shares a login with, which speaks for it.
    var sameAsTitle: String? = nil
    var email: String? = nil

    var id: String { key }
}

/// A Claude account's card title: its name on the Mac, or its id.
func claudeTitle(_ id: String, accounts: [ClaudeAccountInfo]) -> String {
    id == claudeMainLogin ? "Claude" : (accounts.first { $0.id == id }?.name ?? id)
}

/// The Claude cards, one per account, ordered by title then key so the list does
/// not reshuffle between snapshots. Empty while Claude reporting is off on the
/// Mac — no window ever arrives then, and the screen turns that into its own
/// panel. As on the desktop, an account is titled by the name it was given on the
/// Mac (its id until the accounts arrive) over its signed-in email, or over its
/// id when no email is known.
func claudeCards(_ snapshot: LimitsSnapshot, accounts: [ClaudeAccountInfo]) -> [UsageCard] {
    guard snapshot.claudeEnabled else { return [] }
    return snapshot.entries
        .filter { $0.value.provider == "claude" }
        .map { key, data -> UsageCard in
            let id = data.accountId.flatMap { $0.isEmpty ? nil : $0 } ?? claudeMainLogin
            let account = accounts.first { $0.id == id }
            let email = account.flatMap { $0.email.isEmpty ? nil : $0.email }
            let also = accounts.filter { $0.sameAs == id }.map { claudeTitle($0.id, accounts: accounts) }
            let withAlso = { (text: String?) -> String? in
                also.isEmpty ? text : [text, "also on \(also.joined(separator: ", "))"].compactMap { $0 }.joined(separator: " · ")
            }
            let sameAsTitle = account?.sameAs.map { claudeTitle($0, accounts: accounts) }
            let named = id != claudeMainLogin && account?.name != nil
            return UsageCard(key: key, data: data, title: claudeTitle(id, accounts: accounts),
                             subtitle: withAlso(email ?? (named ? id : nil)),
                             account: id, sameAsTitle: sameAsTitle, email: email)
        }
        .sorted { lhs, rhs in
            switch lhs.title.localizedCompare(rhs.title) {
            case .orderedAscending: return true
            case .orderedDescending: return false
            case .orderedSame: return lhs.key.localizedCompare(rhs.key) == .orderedAscending
            }
        }
}

/// Codex reports a single entry per Mac; take the freshest one anyway so a stray
/// duplicate key can never pin the card to an older reading.
func codexEntry(_ snapshot: LimitsSnapshot) -> ProviderLimits? {
    snapshot.entries.values
        .filter { $0.provider == "codex" }
        .max { $0.updatedAt < $1.updatedAt }
}

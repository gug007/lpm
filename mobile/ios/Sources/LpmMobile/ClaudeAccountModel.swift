import Foundation

/// The main login's account id, as the Mac names it in lists and usage readings.
let claudeMainLogin = "default"

/// One Claude login the Mac knows: the main login first, then each account
/// added in the Mac's Settings › Accounts & usage › Claude.
struct ClaudeAccountInfo: Identifiable {
    let id: String
    let label: String
    /// The name given on the Mac, which usage cards and rows are titled by.
    let name: String?
    let signedIn: Bool
    let email: String
    /// "max", "pro", "team", "enterprise", or "" when unknown.
    let plan: String
    /// Confirmed on the Mac as this person's alone, which an account needs
    /// before it takes turns in a list.
    let confirmed: Bool

    init(_ o: [String: Any]) {
        id = o["id"] as? String ?? ""
        signedIn = o["signedIn"] as? Bool ?? false
        email = o["email"] as? String ?? ""
        plan = o["plan"] as? String ?? ""
        confirmed = o["confirmed"] as? Bool ?? false
        let named = (o["label"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        name = named
        if id == claudeMainLogin {
            label = "Main login"
        } else {
            label = named ?? (email.isEmpty ? "Removed account" : email)
        }
    }

    /// Personal plans take turns without the Mac allowing them first.
    var personal: Bool { plan == "max" || plan == "pro" }
}

/// Where account switching stands on the Mac.
struct ClaudeSwitching {
    let enabled: Bool
    /// Switching actually runs: on, confirmed, and possible on that Mac.
    let active: Bool
    /// "hold" or "readings" while switching is paused.
    let paused: String?
    /// Team and work seats the person allowed to take turns.
    let allowed: [String]
    let maxMembers: Int
    /// Each pool's account for new sessions, keyed by the project whose list it
    /// is, or "" for the main accounts.
    let current: [String: String]
    /// Each pool's accounts in order, keyed like `current`; empty from older Macs.
    let members: [String: [String]]

    init(_ o: [String: Any]) {
        enabled = o["enabled"] as? Bool ?? false
        active = o["active"] as? Bool ?? false
        paused = o["paused"] as? String
        allowed = o["allowed"] as? [String] ?? []
        maxMembers = o["maxMembers"] as? Int ?? 3
        var current: [String: String] = [:]
        var members: [String: [String]] = [:]
        for pool in o["pools"] as? [[String: Any]] ?? [] {
            let key = pool["project"] as? String ?? ""
            if let id = pool["current"] as? String { current[key] = id }
            if let ids = pool["members"] as? [String] { members[key] = ids }
        }
        self.current = current
        self.members = members
    }
}

/// The `claudeAccounts` reply: every account and where switching stands.
struct ClaudeAccounts {
    let accounts: [ClaudeAccountInfo]
    let switching: ClaudeSwitching

    init(_ o: [String: Any]) {
        accounts = (o["accounts"] as? [[String: Any]] ?? []).map(ClaudeAccountInfo.init)
        switching = ClaudeSwitching(o["switching"] as? [String: Any] ?? [:])
    }

    /// The menu appears once an account beyond the main login is added, as on the desktop.
    var hasAdded: Bool { accounts.contains { $0.id != claudeMainLogin } }

    func account(_ id: String) -> ClaudeAccountInfo? { accounts.first { $0.id == id } }

    /// An id's name; "" is the main login, as a pin writes it.
    func label(_ id: String) -> String {
        if id.isEmpty || id == claudeMainLogin { return "Main login" }
        return account(id)?.label ?? "Removed account"
    }

    /// Which login the main accounts give new sessions right now.
    var mainNow: String {
        guard switching.active else { return "Main login" }
        let name = label(switching.current[""] ?? claudeMainLogin)
        return switching.paused == nil ? name : "Paused · \(name)"
    }

    /// Why an account can't join a list from the phone, or nil when it can.
    func blocked(_ account: ClaudeAccountInfo) -> String? {
        if !account.signedIn { return "Sign in on your Mac first" }
        if !account.personal && !switching.allowed.contains(account.id) {
            return "Allow it in lpm on your Mac first"
        }
        return nil
    }

    /// What a project's own keys choose, in words.
    func describe(_ own: ClaudeOwnChoice) -> String {
        if let account = own.account { return label(account) }
        if !own.list.isEmpty { return own.list.map(label).joined(separator: ", ") }
        return "Main accounts"
    }
}

/// A project's own `claudeAccount` and `claudeAccounts` keys, as its YAML holds
/// them. Neither set means the main accounts, or for a copy its parent's choice.
struct ClaudeOwnChoice: Equatable {
    /// One account always; "" is the main login.
    var account: String?
    /// An ordered list to take turns on; empty on a copy means the main accounts.
    var accounts: [String]?

    init(account: String? = nil, accounts: [String]? = nil) {
        self.account = account
        self.accounts = accounts
    }

    init(_ o: [String: Any]) {
        account = o["claudeAccount"] as? String
        accounts = o["claudeAccounts"] as? [String]
    }

    var followsParent: Bool { account == nil && accounts == nil }

    /// The project's own list, which a pin outranks.
    var list: [String] { account == nil ? accounts ?? [] : [] }

    func usesMainAccounts(isCopy: Bool) -> Bool {
        if account != nil { return false }
        guard let accounts else { return !isCopy }
        return accounts.isEmpty
    }
}

/// What the menu sets, matching the desktop's `set_claude_account_choice`.
enum ClaudeAccountChoice: Equatable {
    case parent
    case main
    /// "" is the main login.
    case pin(String)
    case list([String])

    var wire: [String: Any] {
        switch self {
        case .parent: return ["kind": "parent"]
        case .main: return ["kind": "main"]
        case .pin(let id): return ["kind": "pin", "id": id]
        case .list(let ids): return ["kind": "list", "ids": ids]
        }
    }

    init?(wire o: [String: Any]) {
        switch o["kind"] as? String {
        case "parent": self = .parent
        case "main": self = .main
        case "pin": self = .pin(o["id"] as? String ?? "")
        case "list": self = .list(o["ids"] as? [String] ?? [])
        default: return nil
        }
    }

    /// The keys the Mac writes for this choice, so the menu shows it before the
    /// projects push brings back what was written.
    func own(isCopy: Bool) -> ClaudeOwnChoice {
        switch self {
        case .parent: return ClaudeOwnChoice()
        case .main: return ClaudeOwnChoice(accounts: isCopy ? [] : nil)
        case .pin(let id): return ClaudeOwnChoice(account: id)
        case .list(let ids): return ClaudeOwnChoice(accounts: ids)
        }
    }
}

/// An account's 5-hour and weekly use as one line ("5h 72% · 7d 41%"), the
/// desktop menu's meters in words. Windows that have already turned over are
/// left out. Nil when there is no current reading.
func claudeUsageLine(_ snapshot: LimitsSnapshot?, account: String, now: Double) -> String? {
    guard let data = snapshot?.entries["claude:\(account)"] else { return nil }
    let parts = [("5h", data.fiveHour), ("7d", data.weekly)].compactMap { label, win -> String? in
        guard let win, win.usedPercent.isFinite else { return nil }
        if win.resetsAt > 0 && Double(win.resetsAt) * 1000 <= now { return nil }
        return "\(label) \(Int(win.usedPercent.rounded()))%"
    }
    return parts.isEmpty ? nil : parts.joined(separator: " · ")
}

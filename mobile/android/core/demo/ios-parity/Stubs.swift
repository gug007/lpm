import Foundation

// The few app types the Demo*.swift files and the helpers copied with them use, from
// ClaudeAccountModel.swift and LpmProtocol.swift, so the demo compiles on its own.

let claudeMainLogin = "default"

struct ClaudeOwnChoice: Equatable {
    var account: String?
    var accounts: [String]?
    init(account: String? = nil, accounts: [String]? = nil) {
        self.account = account
        self.accounts = accounts
    }
}

enum ClaudeAccountChoice: Equatable {
    case parent
    case main
    case pin(String)
    case list([String])

    init?(wire o: [String: Any]) {
        switch o["kind"] as? String {
        case "parent": self = .parent
        case "main": self = .main
        case "pin": self = .pin(o["id"] as? String ?? "")
        case "list": self = .list(o["ids"] as? [String] ?? [])
        default: return nil
        }
    }

    func own(isCopy: Bool) -> ClaudeOwnChoice {
        switch self {
        case .parent: return ClaudeOwnChoice()
        case .main: return ClaudeOwnChoice(accounts: isCopy ? [] : nil)
        case .pin(let id): return ClaudeOwnChoice(account: id)
        case .list(let ids): return ClaudeOwnChoice(accounts: ids)
        }
    }
}

struct Action {
    let cmd: String
    let prompt: String
}

enum Wire {
    static func json(_ obj: [String: Any]) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: obj),
              let s = String(data: data, encoding: .utf8) else { return "{}" }
        return s
    }
}

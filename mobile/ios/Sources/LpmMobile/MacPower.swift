import Foundation

/// Locking or sleeping the Mac from here (`power` in PROTOCOL.md): what it can
/// do, whether it sleeps once its agents finish, and what works on it now.
struct MacPower: Equatable {
    enum Action: String {
        case lockScreen, sleepNow, sleepWhenIdle

        var failure: String {
            switch self {
            case .lockScreen: return "The Mac didn't lock."
            case .sleepNow: return "The Mac didn't go to sleep."
            case .sleepWhenIdle: return "That change didn't go through."
            }
        }
    }

    var canLock: Bool
    var canSleep: Bool
    var armed: Bool
    var agents: Int
    var automations: Int

    init(_ o: [String: Any]) {
        canLock = o["lock"] as? Bool ?? false
        canSleep = o["sleep"] as? Bool ?? false
        armed = o["armed"] as? Bool ?? false
        agents = o["agents"] as? Int ?? 0
        automations = o["automations"] as? Int ?? 0
    }

    var offered: Bool { canLock || canSleep }
    var working: Bool { agents + automations > 0 }

    /// "2 agents working", "1 agent and 1 automation working", "Nothing working".
    var workingLine: String {
        func count(_ n: Int, _ one: String) -> String { n == 1 ? "1 \(one)" : "\(n) \(one)s" }
        switch (agents, automations) {
        case (0, 0): return "Nothing working"
        case (let a, 0): return "\(count(a, "agent")) working"
        case (0, let m): return "\(count(m, "automation")) running"
        case (let a, let m): return "\(count(a, "agent")) and \(count(m, "automation")) working"
        }
    }
}

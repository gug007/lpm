import SwiftUI

/// What an agent is doing, in product words. `idle` is the catch-all for a status
/// nothing acts on. Mirrors the desktop's agentStatus.ts.
enum AgentState: String, CaseIterable, Codable {
    case needsYou, error, working, done, idle

    /// Attention order; lower is more urgent.
    var rank: Int {
        switch self {
        case .needsYou: return 0
        case .error: return 1
        case .working: return 2
        case .done: return 3
        case .idle: return 4
        }
    }

    var label: String {
        switch self {
        case .needsYou: return "Needs you"
        case .error: return "Problem"
        case .working: return "Working"
        case .done: return "Done"
        case .idle: return "Idle"
        }
    }

    /// The four status strings the Mac reports; anything else is idle.
    static func of(_ value: String) -> AgentState {
        switch value {
        case "Waiting": return .needsYou
        case "Error": return .error
        case "Running": return .working
        case "Done": return .done
        default: return .idle
        }
    }
}

/// Status entries carry no provider field; each agent's hooks encode it in the key
/// prefix (desktop src-tauri/src/agentkind.rs).
private let statusKeyAgents: [(prefix: String, label: String)] = [
    ("claude_code_", "Claude Code"),
    ("codex_", "Codex"),
    ("gemini_", "Gemini CLI"),
    ("cursor_", "Cursor"),
    ("opencode_", "OpenCode"),
    ("omp_", "omp"),
]

func agentProviderLabel(forStatusKey key: String) -> String {
    statusKeyAgents.first { key.hasPrefix($0.prefix) }?.label ?? "Agent"
}

/// The state colours the app speaks, shared by the rows and the header counts so
/// a dot means the same thing everywhere. Done is blue, as on the desktop; working
/// is told apart from it by `agentTone`'s sweep wherever the two sit together.
extension AgentState {
    var tint: SwiftUI.Color {
        switch self {
        case .needsYou: return .orange
        case .error: return .red
        case .working: return .blue
        case .done: return .blue
        case .idle: return .secondary
        }
    }
}

/// The desktop's working colors. A lap of the palette spans three view widths; the
/// strip holds three laps closed on its first color, so sliding it two laps ends
/// where it began.
enum AgentSweep {
    static let palette: [Color] = [
        Color(red: 0.231, green: 0.510, blue: 0.965),
        Color(red: 0.545, green: 0.361, blue: 0.965),
        Color(red: 0.925, green: 0.282, blue: 0.600),
        Color(red: 0.024, green: 0.714, blue: 0.831),
        Color(red: 0.388, green: 0.400, blue: 0.945),
    ]
    static let strip = palette + palette + palette + [palette[0]]

    /// The sweep held still at its start, for wherever it can't move.
    static let still = LinearGradient(colors: strip, startPoint: .leading,
                                      endPoint: UnitPoint(x: 9, y: 0.5))
}

/// "12s", "4m", "4m 30s", "1h 12m" — matches the desktop's formatDuration.
func formatDuration(_ secs: Int) -> String {
    if secs < 60 { return "\(max(0, secs))s" }
    let mins = secs / 60
    if mins < 60 {
        let rest = secs % 60
        return rest > 0 ? "\(mins)m \(rest)s" : "\(mins)m"
    }
    let rest = mins % 60
    return rest > 0 ? "\(mins / 60)h \(rest)m" : "\(mins / 60)h"
}

/// "45s", "4m", "2h 5m" — `formatDuration` with the remainder dropped, for
/// a row with room for a reading rather than a stopwatch. Takes millis, and rounds
/// down like a stopwatch: it says what has elapsed, never more.
func shortDuration(millis: Int) -> String {
    let secs = max(0, millis / 1000)
    if secs < 60 { return "\(secs)s" }
    let mins = secs / 60
    if mins < 60 { return "\(mins)m" }
    let rest = mins % 60
    return rest > 0 ? "\(mins / 60)h \(rest)m" : "\(mins / 60)h"
}

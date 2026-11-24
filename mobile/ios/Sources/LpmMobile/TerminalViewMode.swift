import SwiftUI

/// What an agent tab's screen shows: its terminal, or the conversation in it. Picked
/// in the screen's "…" menu and kept for every agent tab.
enum TerminalViewMode: String, CaseIterable, Identifiable {
    case terminal, conversation

    static let storageKey = "terminal.view"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .terminal: return "Terminal"
        case .conversation: return "Conversation"
        }
    }

    var systemImage: String {
        switch self {
        case .terminal: return "terminal"
        case .conversation: return "text.bubble"
        }
    }
}

/// The "…" menu's View section.
struct TerminalViewMenu: View {
    @Binding var mode: TerminalViewMode

    var body: some View {
        // Toggles rather than an inline picker, which would drop the heading.
        Section("View") {
            ForEach(TerminalViewMode.allCases) { choice in
                Toggle(isOn: Binding(get: { mode == choice }, set: { if $0 { mode = choice } })) {
                    Label(choice.label, systemImage: choice.systemImage)
                }
            }
        }
    }
}

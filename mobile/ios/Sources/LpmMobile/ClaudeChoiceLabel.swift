import SwiftUI

/// One choice in a Claude account menu: its title over a detail line, checked
/// when it's the one in use.
struct ClaudeChoiceLabel: View {
    let title: String
    let subtitle: String?
    let on: Bool

    var body: some View {
        if on {
            Label {
                Text(title)
                if let subtitle { Text(subtitle) }
            } icon: {
                Image(systemName: "checkmark")
            }
        } else {
            Text(title)
            if let subtitle { Text(subtitle) }
        }
    }
}

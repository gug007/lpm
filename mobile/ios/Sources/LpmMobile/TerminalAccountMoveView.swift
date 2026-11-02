import SwiftUI

/// Covers a terminal while its Claude conversation moves to another account,
/// as the desktop covers the tab: the old session stopping and the new shell
/// starting underneath never show, only Claude back on the account picked.
struct TerminalAccountMoveView: View {
    let account: String
    let background: Color

    var body: some View {
        HStack(spacing: 8) {
            ProgressView()
                .tint(providerMeta("claude").color)
            Text("Continuing on \(account)…")
                .font(.footnote)
                .foregroundStyle(.white.opacity(0.5))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(background)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("terminal-account-move")
    }
}

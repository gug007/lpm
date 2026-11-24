import SwiftUI

extension View {
    /// What stands in the composer's place: on the terminal's ground, under a hairline.
    func terminalBottomBar(_ background: Color) -> some View {
        padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(background)
            .overlay(alignment: .top) {
                Rectangle().fill(.white.opacity(0.12)).frame(height: 0.5)
            }
            .environment(\.colorScheme, .dark)
    }
}

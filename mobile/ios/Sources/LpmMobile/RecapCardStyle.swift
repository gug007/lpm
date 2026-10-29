import SwiftUI

/// The recap card's look and its measures in design units, from the desktop's
/// recapCardTheme.ts: its default light theme. The card is laid out 600 wide and
/// scaled to fit.
enum RecapCardStyle {
    static let glow = Color(hex: "#e6f2e8")
    static let ground = Color(hex: "#fafaf7")
    static let border = Color(hex: "#e2e2dc")
    static let text = Color(hex: "#1f1f1f")
    static let strong = Color(hex: "#111111")
    static let soft = Color(hex: "#4a4a4a")
    static let muted = Color(hex: "#5f5f5f")
    static let tile = Color(hex: "#ffffff")
    static let green = Color(hex: "#15803d")
    static let red = Color(hex: "#b91c1c")
    static let markGround = Color(hex: "#f0f0ec")
    static let markBorder = Color(hex: "#deded8")
    static let markDot = Color(hex: "#16a34a")
    static let markRing = Color(hex: "#7a7a7a")

    static let title = "My agents' week"
    static let monthTitle = "My agents' month"
    static let hoursLabel = "of agents working for me"
    static let tokensLabel = "tokens read and written by my agents"

    static let width: CGFloat = 600
    static let padX: CGFloat = 28
    static let padTop: CGFloat = 26
    static let padBottom: CGFloat = 24
    static let gap: CGFloat = 16
    static let radius: CGFloat = 14
    static let titleSize: CGFloat = 17
    static let headerLine: CGFloat = 22
    static let heroSize: CGFloat = 64
    /// The hours, under the tokens.
    static let hoursSize: CGFloat = 52
    static let heroTracking: CGFloat = -0.02
    /// Between a big number and its label under it.
    static let stackGap: CGFloat = 6
    static let labelLine: CGFloat = 18
    static let bodySize: CGFloat = 15
    static let tileGap: CGFloat = 10
    static let tileRadius: CGFloat = 10
    static let tilePadX: CGFloat = 13
    static let tilePadY: CGFloat = 11
    static let tileValueLine: CGFloat = 28
    static let tileLabelLine: CGFloat = 16
    static let rowSize: CGFloat = 14
    static let rowLine: CGFloat = 18
    static let footerLine: CGFloat = 36
    /// The angle of the green glow, as CSS writes it.
    static let glowDegrees: Double = 150
}

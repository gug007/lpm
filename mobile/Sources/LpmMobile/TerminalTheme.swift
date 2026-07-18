import SwiftUI
import UIKit

/// The terminal color schemes, mirroring the desktop app's `terminal-themes.ts`
/// so a theme picked here looks the same as on the Mac. Only the four dynamic
/// colors (background / foreground / cursor / selection) vary per theme; the ANSI
/// palette is shared and lives in the web page (terminal.html).
///
/// `.default` is the phone's own true-black OLED look (the Mac's default is a
/// lighter #1a1a1a); every other case matches the desktop values exactly. The
/// out-of-the-box selection is `TerminalPrefs.defaultTheme` (Claude Dark).
enum TerminalTheme: String, CaseIterable, Identifiable {
    case `default` = "default"
    case oneDark = "one-dark"
    case monokai = "monokai"
    case dracula = "dracula"
    case nord = "nord"
    case solarizedDark = "solarized-dark"
    case githubDark = "github-dark"
    case claudeDark = "claude-dark"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .default: return "Default"
        case .oneDark: return "One Dark"
        case .monokai: return "Monokai"
        case .dracula: return "Dracula"
        case .nord: return "Nord"
        case .solarizedDark: return "Solarized Dark"
        case .githubDark: return "GitHub Dark"
        case .claudeDark: return "Claude Dark"
        }
    }

    var background: String {
        switch self {
        case .default: return "#000000"
        case .oneDark: return "#282c34"
        case .monokai: return "#272822"
        case .dracula: return "#282a36"
        case .nord: return "#2e3440"
        case .solarizedDark: return "#002b36"
        case .githubDark: return "#0d1117"
        case .claudeDark: return "#2b2b2b"
        }
    }

    var foreground: String {
        switch self {
        case .default: return "#cccccc"
        case .oneDark: return "#abb2bf"
        case .monokai: return "#f8f8f2"
        case .dracula: return "#f8f8f2"
        case .nord: return "#d8dee9"
        case .solarizedDark: return "#839496"
        case .githubDark: return "#c9d1d9"
        case .claudeDark: return "#c8c8c8"
        }
    }

    var cursor: String {
        switch self {
        case .default: return "#cccccc"
        case .oneDark: return "#528bff"
        case .monokai: return "#f8f8f0"
        case .dracula: return "#f8f8f2"
        case .nord: return "#d8dee9"
        case .solarizedDark: return "#839496"
        case .githubDark: return "#c9d1d9"
        case .claudeDark: return "#c8c8c8"
        }
    }

    var selection: String {
        switch self {
        case .default: return "#444444"
        case .oneDark: return "#3e4451"
        case .monokai: return "#49483e"
        case .dracula: return "#44475a"
        case .nord: return "#434c5e"
        case .solarizedDark: return "#073642"
        case .githubDark: return "#1f2937"
        case .claudeDark: return "#484848"
        }
    }

    /// The background as a UIColor, for the web view's ground and the surrounding
    /// SwiftUI chrome (nav bar, safe area) so they read as one continuous surface.
    var uiBackground: UIColor { UIColor(hexString: background) }

    /// The background as a SwiftUI Color.
    var backgroundColor: Color { Color(uiColor: uiBackground) }

    /// The foreground as a SwiftUI Color, for the settings preview swatch.
    var foregroundColor: Color { Color(uiColor: UIColor(hexString: foreground)) }
}

/// Storage keys and bounds for the phone-local terminal preferences (font size +
/// theme). These live on the phone — the terminal is this device's own view — the
/// same way `AppearanceMode` does.
enum TerminalPrefs {
    static let fontSizeKey = "terminalFontSize"
    static let themeKey = "terminalTheme"
    static let defaultFontSize = 12
    static let minFontSize = 8
    static let maxFontSize = 24
    static let defaultTheme: TerminalTheme = .claudeDark

    /// The stored theme, defaulting to Claude Dark; unknown values fall back too.
    static func theme(_ raw: String) -> TerminalTheme {
        TerminalTheme(rawValue: raw) ?? defaultTheme
    }
}

private extension UIColor {
    /// Parse a `#rrggbb` (or `rrggbb`) hex string into an opaque color. Falls back
    /// to black on any malformed input so a bad value can't crash the terminal.
    convenience init(hexString: String) {
        let hex = hexString.hasPrefix("#") ? String(hexString.dropFirst()) : hexString
        var rgb: UInt64 = 0
        guard hex.count == 6, Scanner(string: hex).scanHexInt64(&rgb) else {
            self.init(red: 0, green: 0, blue: 0, alpha: 1)
            return
        }
        self.init(
            red: CGFloat((rgb >> 16) & 0xFF) / 255,
            green: CGFloat((rgb >> 8) & 0xFF) / 255,
            blue: CGFloat(rgb & 0xFF) / 255,
            alpha: 1
        )
    }
}

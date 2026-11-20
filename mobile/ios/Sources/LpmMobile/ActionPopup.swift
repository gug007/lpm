import UIKit

/// An action's popup card as the projects list announces it (PROTOCOL.md, Action
/// popups): the format of its page, the page's height in points and its heading.
/// `problem` says why the config can't make one.
struct ActionPopupInfo {
    static let html = "html"
    static let defaultHeight = 220

    let format: String
    let title: String
    let height: Int
    let problem: String

    init?(_ value: Any?) {
        guard let o = value as? [String: Any] else { return nil }
        format = o["format"] as? String ?? ""
        title = o["title"] as? String ?? ""
        height = (o["height"] as? NSNumber)?.intValue ?? Self.defaultHeight
        problem = o["problem"] as? String ?? ""
    }
}

/// An action's app as the projects list announces it (PROTOCOL.md, Action apps):
/// a tap opens its page full screen instead of running a command.
struct ActionAppInfo {
    let format: String
    let title: String
    let problem: String

    init?(_ value: Any?) {
        guard let o = value as? [String: Any] else { return nil }
        format = o["format"] as? String ?? ""
        title = o["title"] as? String ?? ""
        problem = o["problem"] as? String ?? ""
    }
}

/// Which of an action's pages: the popup a long press opens, or the app a tap
/// opens full screen. The page reads it as `lpm.view`.
enum ActionPageView: String {
    case popup
    case tab
}

/// The page and data the Mac made for one opening, or one refresh, of a popup.
struct ActionPopupContent {
    /// Seconds between refreshes while the sheet is open; 0 for only when it opens.
    let refresh: Int
    /// The whole page; nil when it couldn't be made, and `error` says why.
    let html: String?
    /// What the `data` command printed, `NSNull` when it printed none.
    let data: Any
    let text: String
    let dataError: String
    let error: String
    /// When the page and data were made, in Unix milliseconds; 0 when unknown.
    let updatedAt: Int64
    /// Older than the config's `cache`: show it, and ask again with `fresh`.
    let stale: Bool
    /// Why the last run failed while this, the last good result, is shown.
    let refreshError: String

    init(_ o: [String: Any]) {
        refresh = max((o["refresh"] as? NSNumber)?.intValue ?? 0, 0)
        html = o["html"] as? String
        data = o["data"] ?? NSNull()
        text = o["text"] as? String ?? ""
        dataError = o["dataError"] as? String ?? ""
        error = o["error"] as? String ?? ""
        updatedAt = (o["updatedAt"] as? NSNumber)?.int64Value ?? 0
        stale = o["stale"] as? Bool ?? false
        refreshError = o["refreshError"] as? String ?? ""
    }
}

/// The Mac's answer to `actionPopup` or `actionApp`: the page, or why there's none.
struct ActionPopupReply {
    let view: ActionPageView
    let project: String
    let action: String
    let content: ActionPopupContent?
    let error: String

    init(_ o: [String: Any]) {
        view = o["t"] as? String == "actionApp" ? .tab : .popup
        project = o["project"] as? String ?? ""
        action = o["action"] as? String ?? ""
        let key = view == .tab ? "app" : "popup"
        if o["ok"] as? Bool == true, let page = o[key] as? [String: Any] {
            content = ActionPopupContent(page)
            error = ""
        } else {
            content = nil
            error = (o["error"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? ActionPopupCopy.couldNotOpen(view)
        }
    }
}

enum ActionPopupCopy {
    static let lateAnswer = "The Mac didn't answer in time."

    static func couldNotOpen(_ view: ActionPageView) -> String {
        view == .tab ? "Couldn't open the app." : "Couldn't open the popup."
    }

    static func newerApp(_ view: ActionPageView) -> String {
        view == .tab ? "This app needs a newer lpm Link." : "This popup needs a newer lpm Link."
    }

    static func stopped(_ view: ActionPageView) -> String {
        view == .tab ? "The app stopped working." : "The popup stopped working."
    }
}

/// What the page's scripts read as `window.lpm`, and the values a refresh hands to
/// `window.__lpmPush`, as JSON safe to put in a script.
enum ActionPopupPayload {
    static func bootstrap(_ content: ActionPopupContent, project: String, action: String,
                          view: ActionPageView, dark: Bool) -> String {
        script([
            "data": content.data,
            "text": content.text,
            "error": content.dataError,
            "theme": theme(dark: dark),
            "project": project,
            "action": action,
            "view": view.rawValue,
        ])
    }

    static func push(_ content: ActionPopupContent) -> String {
        script(["data": content.data, "text": content.text, "error": content.dataError])
    }

    /// JSON text for a JSON value, "null" for one JSONSerialization can't write.
    static func json(_ value: Any) -> String {
        guard JSONSerialization.isValidJSONObject([value]),
              let data = try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed, .sortedKeys]),
              let text = String(data: data, encoding: .utf8) else { return "null" }
        return text
    }

    /// No `<` can end the script it lands in, and no line separator can end a line
    /// of it.
    private static func script(_ object: [String: Any]) -> String {
        json(object)
            .replacingOccurrences(of: "<", with: "\\u003c")
            .replacingOccurrences(of: "\u{2028}", with: "\\u2028")
            .replacingOccurrences(of: "\u{2029}", with: "\\u2029")
    }

    /// lpm Link's own colors, as a sheet shows them in this appearance.
    static func theme(dark: Bool) -> [String: Any] {
        let traits = UITraitCollection { traits in
            traits.userInterfaceStyle = dark ? .dark : .light
            traits.userInterfaceLevel = .elevated
        }
        let colors: [String: UIColor] = [
            "bg": .systemGroupedBackground,
            "surface": .secondarySystemGroupedBackground,
            "text": .label,
            "muted": .secondaryLabel,
            "border": .separator,
            "accent": .systemBlue,
            "green": .systemGreen,
            "red": .systemRed,
            "amber": .systemOrange,
        ]
        return ["mode": dark ? "dark" : "light",
                "colors": colors.mapValues { css($0.resolvedColor(with: traits)) }]
    }

    /// `#rrggbb`, or `rgba(r, g, b, a)` for a color that isn't opaque.
    static func css(_ color: UIColor) -> String {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        color.getRed(&r, green: &g, blue: &b, alpha: &a)
        let c = [r, g, b].map { min(max(Int(($0 * 255).rounded()), 0), 255) }
        if a >= 0.995 { return String(format: "#%02x%02x%02x", c[0], c[1], c[2]) }
        return String(format: "rgba(%d, %d, %d, %.2f)", c[0], c[1], c[2], max(a, 0))
    }
}

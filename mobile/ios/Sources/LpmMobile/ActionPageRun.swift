import SwiftUI

/// What a popup or app page asks of the phone through `bootstrap.js`
/// (PROTOCOL.md, Action popups): a run of one of the project's actions, or its
/// data again.
enum ActionPageAsk {
    case run(id: String, action: String, inputs: [String: String])
    case refresh

    init?(_ body: Any) {
        guard let o = body as? [String: Any] else { return nil }
        if o["lpmRefresh"] as? Bool == true {
            self = .refresh
            return
        }
        guard let run = o["lpmRun"] as? [String: Any],
              let id = run["id"] as? String,
              let action = run["action"] as? String else { return nil }
        let inputs = (run["inputs"] as? [String: Any] ?? [:]).compactMapValues { $0 as? String }
        self = .run(id: id, action: action, inputs: inputs)
    }
}

/// What a page's `lpm.run` resolves with.
struct ActionPageRunResult {
    var ok = false
    var output = ""
    var error = ""
    var canceled = false

    /// The newest part of a run's output a page gets back, as on the desktop.
    private static let maxOutput = 256 * 1024
    private static let colors = try? NSRegularExpression(pattern: "\u{1B}\\[[0-9;:]*m")

    static func output(_ text: String) -> String {
        let range = NSRange(text.startIndex..., in: text)
        let plain = colors?.stringByReplacingMatches(in: text, range: range, withTemplate: "") ?? text
        let trimmed = plain.hasSuffix("\n") ? String(plain.dropLast()) : plain
        return trimmed.count > maxOutput ? String(trimmed.suffix(maxOutput)) : trimmed
    }

    /// The reply `window.__lpmReply` takes, as JSON.
    func json(id: String) -> String {
        let reply: [String: Any] = ["id": id, "ok": ok, "output": output, "error": error, "canceled": canceled]
        guard let data = try? JSONSerialization.data(withJSONObject: reply),
              let json = String(data: data, encoding: .utf8) else { return "{\"id\":\"\(id)\"}" }
        return json
    }
}

typealias ActionPageRun = (_ id: String, _ action: String, _ inputs: [String: String],
                           _ reply: @escaping (ActionPageRunResult) -> Void) -> Void

private struct ActionPageRunKey: EnvironmentKey {
    static let defaultValue: ActionPageRun? = nil
}

extension EnvironmentValues {
    /// Runs what a page in this sheet asks for (see ActionPageRunHost).
    var actionPageRun: ActionPageRun? {
        get { self[ActionPageRunKey.self] }
        set { self[ActionPageRunKey.self] = newValue }
    }
}

extension Action {
    /// The values a page gave the action's inputs, each one the input takes, and
    /// whether they leave nothing to ask.
    func pageInputs(_ given: [String: String]) -> (values: [String: String], complete: Bool) {
        var values: [String: String] = [:]
        for input in inputs {
            guard let value = given[input.key] else { continue }
            if input.required && value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { continue }
            if !input.options.isEmpty && !input.options.contains(where: { $0.value == value }) { continue }
            values[input.key] = value
        }
        return (values, inputs.allSatisfy { values[$0.key] != nil })
    }

    fileprivate var all: [Action] { [self] + children.flatMap(\.all) }
}

extension Array where Element == Action {
    /// The action a page names, found as the desktop finds it: by its path, then
    /// by a nested action's own name, then by either in any case, then by its label.
    func pageAction(named name: String) -> Action? {
        let all = flatMap(\.all)
        if let exact = all.first(where: { $0.name == name }) { return exact }
        func leaf(_ action: Action) -> String { action.name.split(separator: ":").last.map(String.init) ?? action.name }
        func only(_ matches: [Action]) -> Action? { matches.count == 1 ? matches[0] : nil }
        if !name.contains(":"), let match = only(all.filter { leaf($0) == name }) { return match }
        let lower = name.lowercased()
        if let match = only(all.filter { $0.name.lowercased() == lower || leaf($0).lowercased() == lower }) {
            return match
        }
        return only(all.filter { $0.label.lowercased() == lower })
    }
}

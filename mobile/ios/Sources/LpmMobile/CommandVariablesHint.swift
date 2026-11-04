import SwiftUI

/// Under the editor's prompt: which `{{variables}}` a run asks for and which lpm
/// fills in by itself, or how to add them when the prompt has none. The
/// desktop's CommandEditor says the same.
struct CommandVariablesHint: View {
    let prompt: String
    let name: String

    private static let autoTint = Color(light: "#16A34A", dark: "#4ADE80")

    var body: some View {
        let (asks, auto) = LpmCommandRules.variables(prompt)
        if asks.isEmpty && auto.isEmpty {
            Text("Add \(mono("{{ticket}}")) to ask for a value when it runs; \(mono("{{branch}}")), \(mono("{{project}}")) and \(mono("{{dir}}")), the skill's folder, fill themselves in.")
        } else {
            Text("\(asksLine(asks))\(autoLine(auto))")
        }
    }

    private func asksLine(_ asks: [String]) -> Text {
        guard !asks.isEmpty else { return Text(verbatim: "") }
        return Text("Asks for \(tokens(asks, accentCyan))from the words after \(mono("/" + (name.isEmpty ? "name" : name))), in order. ")
    }

    private func autoLine(_ auto: [String]) -> Text {
        guard !auto.isEmpty else { return Text(verbatim: "") }
        return Text("Fills in \(tokens(auto, Self.autoTint))by itself.")
    }

    private func tokens(_ names: [String], _ tint: Color) -> Text {
        names.reduce(Text(verbatim: "")) { line, name in
            Text("\(line)\(mono(name).foregroundColor(tint)) ")
        }
    }

    private func mono(_ s: String) -> Text {
        Text(verbatim: s).font(.system(.footnote, design: .monospaced))
    }
}

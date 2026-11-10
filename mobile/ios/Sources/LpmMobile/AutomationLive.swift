import Foundation

/// A running agent's live output as the Mac renders it: what the agent says, and
/// one `→ Tool` line for each tool it calls (the desktop's jobLive.ts).
enum AutomationLivePart: Equatable {
    case text(String)
    case steps([String])
}

func automationLiveParts(_ text: String) -> [AutomationLivePart] {
    var parts: [AutomationLivePart] = []
    var said: [String] = []
    var steps: [String] = []
    func close() {
        if !said.isEmpty { parts.append(.text(trimmingEnd(said.joined(separator: "\n")))) }
        if !steps.isEmpty { parts.append(.steps(steps)) }
        said = []
        steps = []
    }
    for line in text.components(separatedBy: "\n") {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        if let name = stepName(trimmed) {
            if !said.isEmpty { close() }
            steps.append(name)
        } else if !said.isEmpty || !trimmed.isEmpty {
            if !steps.isEmpty { close() }
            said.append(line)
        }
    }
    close()
    return parts
}

/// The tool a `→ Tool` line names, as the desktop's jobLive.ts reads it.
private func stepName(_ line: String) -> String? {
    guard line.hasPrefix("→ ") else { return nil }
    let name = line.dropFirst(2)
    guard let first = name.first, !first.isWhitespace else { return nil }
    return String(name)
}

private func trimmingEnd(_ text: String) -> String {
    var end = text.endIndex
    while end > text.startIndex, text[text.index(before: end)].isWhitespace {
        end = text.index(before: end)
    }
    return String(text[..<end])
}

/// "Skill, Read, Bash ×7": each tool once, in the order first used, with how many
/// times it ran when more than once.
func automationStepsLabel(_ names: [String]) -> String {
    var order: [String] = []
    var counts: [String: Int] = [:]
    for name in names {
        if counts[name] == nil { order.append(name) }
        counts[name, default: 0] += 1
    }
    return order.map { counts[$0]! > 1 ? "\($0) ×\(counts[$0]!)" : $0 }.joined(separator: ", ")
}

/// The last lines of a live run, each run of steps folded onto one line, so a burst
/// of tool calls can't push what the agent said out of view.
func automationLiveTail(_ text: String, maxLines: Int = 12) -> String {
    let folded = automationLiveParts(text).map { part -> String in
        switch part {
        case .text(let said): return said
        case .steps(let names): return "→ " + automationStepsLabel(names)
        }
    }
    let lines = folded.joined(separator: "\n").components(separatedBy: "\n")
    return lines.suffix(maxLines).joined(separator: "\n")
}

extension AutomationJob {
    /// The questions the run still going asked: one from a finished run names its
    /// entry, and a keyed one belongs to no run.
    var runningRunAsks: [AutomationAsk] {
        guard running else { return [] }
        return asks.filter { $0.isOpen && $0.at == nil && $0.holdsJob }
    }

    /// The questions it waits on outside the run still going, which shows its own.
    var asksOutsideRun: [AutomationAsk] {
        let run = Set(runningRunAsks.map(\.id))
        return asks.filter { !run.contains($0.id) }
    }

    /// A Manual automation only runs when asked to, so on/off says nothing about
    /// it: its switch stays only to turn one back on.
    var hasOnOffSwitch: Bool { !(scheduleMode == "manual" && enabled) }
}

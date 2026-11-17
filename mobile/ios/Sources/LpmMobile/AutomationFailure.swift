import SwiftUI

/// The results a run ends in when it failed; their dot is red.
let automationFailedResults: Set<String> = ["error", "timed-out", "context-full"]

/// The last run failed, and nothing about the job matters more right now: it's
/// valid, enabled, not running and not waiting on an answer.
func automationLastRunFailed(_ job: AutomationJob) -> Bool {
    job.valid && job.ask == nil && !job.running && job.enabled
        && automationFailedResults.contains(job.lastResult)
}

/// A question of the job's waits for your answer: the list's "Needs you"
/// filter keeps it.
func automationNeedsAnswer(_ job: AutomationJob) -> Bool {
    job.valid && !job.asks.isEmpty
}

/// The automations list's filter, as the desktop's.
enum AutomationListFilter: Hashable {
    case all, needsYou, failed

    func keeps(_ job: AutomationJob) -> Bool {
        switch self {
        case .all: true
        case .needsYou: automationNeedsAnswer(job)
        case .failed: automationLastRunFailed(job)
        }
    }
}

/// What a row needs from you, as the desktop list marks it: a question waiting
/// ("Needs you"), a failed last run, or a job that can't run — a tinted word
/// ahead of the line, which stays in the body color.
struct AutomationRowChip {
    let label: String
    let color: Color
    let text: String
    let answering: Bool

    init?(_ job: AutomationJob) {
        if !job.valid {
            label = "Can't run"
            color = .red
            text = automationInvalidText(job)
            answering = false
        } else if let ask = job.asks.first, job.enabled {
            label = job.asks.count > 1 ? "\(job.asks.count) questions" : "Needs you"
            color = .orange
            text = ask.summary
            answering = true
        } else if automationLastRunFailed(job) {
            label = "Failed"
            color = .red
            text = automationFailureText(job)
            answering = false
        } else {
            return nil
        }
    }
}

/// A failed row says how long the run went and why it stopped, as the desktop
/// does: "Problem during the run after 1m 1s · The check couldn't run: …".
func automationFailureText(_ job: AutomationJob) -> String {
    var text = automationResultLabel(job.lastResult)
    if let secs = job.lastDurationSecs, secs > 0 { text += " after \(automationRunLengthText(secs))" }
    guard let note = job.lastNote.map({ automationNoteLine($0) }), !note.isEmpty else { return text }
    return "\(text) · \(note)"
}

/// "12s", "4m", "4m 30s", "1h 12m", "1h" — how long a run took.
func automationRunLengthText(_ secs: Int) -> String {
    if secs < 60 { return "\(max(0, secs))s" }
    let mins = secs / 60
    if mins < 60 {
        let rest = secs % 60
        return rest > 0 ? "\(mins)m \(rest)s" : "\(mins)m"
    }
    let rest = mins % 60
    return rest > 0 ? "\(mins / 60)h \(rest)m" : "\(mins / 60)h"
}

/// A run's words on one line: citation markers, code blocks and markdown
/// markers dropped, links reduced to their text, whitespace collapsed.
func automationNoteLine(_ text: String, max: Int = 240) -> String {
    let rules: [(String, String)] = [
        ("[ \\t]*\\uE200[^\\uE201]*\\uE201", ""),
        ("[\\uE200-\\uE2FF]", ""),
        ("```[\\s\\S]*?(```|$)", " "),
        ("\\[([^\\]]*)\\]\\([^)]*\\)", "$1"),
        ("[#*_>`|]", ""),
        ("\\s+", " "),
    ]
    var flat = text
    for (pattern, template) in rules {
        flat = flat.replacingOccurrences(of: pattern, with: template, options: .regularExpression)
    }
    flat = flat.trimmingCharacters(in: .whitespaces)
    guard flat.count > max else { return flat }
    return String(flat.prefix(max)).trimmingCharacters(in: .whitespaces) + "…"
}

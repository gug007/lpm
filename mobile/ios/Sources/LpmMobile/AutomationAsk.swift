import Foundation

/// One option of a pick-from-a-list question.
struct AutomationAskOption: Hashable {
    let label: String
    let description: String
}

/// One question of an automation's `JobAsk`. A type this build doesn't know is
/// answered as text.
struct AutomationAskQuestion: Identifiable {
    let id: String
    let type: String
    let text: String
    let yes: String
    let no: String
    let options: [AutomationAskOption]
    let multiple: Bool
    /// The list also takes an answer in the user's own words.
    let other: Bool
    let multiline: Bool
    let placeholder: String
    let optional: Bool
    let defaultAnswer: Any?

    init(_ o: [String: Any]) {
        id = o["id"] as? String ?? ""
        type = o["type"] as? String ?? "text"
        text = o["text"] as? String ?? ""
        yes = o["yes"] as? String ?? ""
        no = o["no"] as? String ?? ""
        options = (o["options"] as? [[String: Any]] ?? []).map {
            AutomationAskOption(label: $0["label"] as? String ?? "",
                                description: $0["description"] as? String ?? "")
        }
        multiple = o["multiple"] as? Bool ?? false
        other = o["other"] as? Bool ?? false
        multiline = o["multiline"] as? Bool ?? false
        placeholder = o["placeholder"] as? String ?? ""
        optional = o["optional"] as? Bool ?? false
        defaultAnswer = o["default"]
    }

    var yesLabel: String { yes.isEmpty ? "Yes" : yes }
    var noLabel: String { no.isEmpty ? "No" : no }
}

/// A question an automation run put to the user (`lpm ask`), and how it ended.
struct AutomationAsk: Identifiable {
    let id: String
    let askedAt: Int
    let questions: [AutomationAskQuestion]
    let expiresAt: Int?
    let status: String
    let answers: [String: Any]
    /// The user's own words, when they answered with a plain reply.
    let reply: String?
    let answeredAt: Int?
    /// Nobody answered in time and the defaults stood in.
    let auto: Bool
    /// On an automation row: where it waits — the project to answer in.
    let project: String
    /// What the asker filed it under: one open question per key, none of them
    /// holding the automation up, and its answer goes to its onAnswer command.
    let key: String?
    /// On an automation row: the run entry that asked it; nil while that run is
    /// still going.
    let at: Int?

    init?(_ value: Any?) {
        guard let o = value as? [String: Any], let id = o["id"] as? String else { return nil }
        self.id = id
        askedAt = o["askedAt"] as? Int ?? 0
        questions = (o["questions"] as? [[String: Any]] ?? []).map(AutomationAskQuestion.init)
        expiresAt = o["expiresAt"] as? Int
        status = o["status"] as? String ?? "open"
        answers = o["answers"] as? [String: Any] ?? [:]
        reply = o["reply"] as? String
        answeredAt = o["answeredAt"] as? Int
        auto = o["auto"] as? Bool ?? false
        project = o["project"] as? String ?? ""
        key = o["key"] as? String
        at = o["at"] as? Int
    }

    var isOpen: Bool { status == "open" }
    /// A question asked without a key stops the automation's runs until it's answered.
    var holdsJob: Bool { key == nil }

    /// One question settled by a single tap: its yes or no, or the one option it takes.
    var answersOnTap: Bool {
        guard questions.count == 1, let q = questions.first else { return false }
        return q.type == "confirm" || (q.type == "choice" && !q.multiple)
    }

    /// The first question, and how many more come with it.
    var summary: String {
        let first = questions.first?.text ?? ""
        return questions.count > 1 ? "\(first) (+\(questions.count - 1) more)" : first
    }

    /// How the question ended, for the line over it.
    var statusLabel: String {
        switch status {
        case "open": return automationWaitingLabel
        case "answered":
            if auto { return "No answer in time — the default was used" }
            return reply == nil ? "Answered" : "Answered in a reply"
        case "dismissed": return "Skipped"
        case "replaced": return "Replaced by a newer question"
        default: return "No answer"
        }
    }
}

/// What the user has filled in for one question so far.
struct AutomationAskDraft: Equatable {
    var picks: [String] = []
    var other = ""
    var text = ""
}

func automationAskAnswer(_ q: AutomationAskQuestion, _ d: AutomationAskDraft) -> Any? {
    switch q.type {
    case "confirm":
        switch d.picks.first {
        case "yes": return true
        case "no": return false
        default: return nil
        }
    case "choice":
        let own = q.other ? d.other.trimmingCharacters(in: .whitespacesAndNewlines) : ""
        let picks = own.isEmpty ? d.picks : d.picks + [own]
        return picks.isEmpty ? nil : picks
    default:
        let text = d.text.trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? nil : text
    }
}

/// Every answer the drafts give, or the first question still waiting for one.
func automationAskAnswers(_ questions: [AutomationAskQuestion],
                          _ drafts: [String: AutomationAskDraft])
    -> (answers: [String: Any], missing: AutomationAskQuestion?) {
    var answers: [String: Any] = [:]
    var missing: AutomationAskQuestion?
    for q in questions {
        if let a = automationAskAnswer(q, drafts[q.id] ?? AutomationAskDraft()) {
            answers[q.id] = a
        } else if !q.optional, missing == nil {
            missing = q
        }
    }
    return (answers, missing)
}

/// Pick (or unpick) an option: one at a time unless the question takes several.
func automationAskToggle(_ q: AutomationAskQuestion, _ d: AutomationAskDraft,
                         _ label: String) -> AutomationAskDraft {
    var next = d
    if let i = d.picks.firstIndex(of: label) {
        next.picks.remove(at: i)
    } else if q.multiple {
        next.picks.append(label)
    } else {
        next.picks = [label]
        next.other = ""
    }
    return next
}

/// An answer the way a person reads it: a button's label, the picks, or the text.
func automationAskDisplay(_ q: AutomationAskQuestion, _ answer: Any?) -> String {
    switch answer {
    case let yes as Bool where q.type == "confirm": return yes ? q.yesLabel : q.noLabel
    case let picks as [String]: return picks.joined(separator: ", ")
    case let text as String: return text
    case let n as NSNumber: return n.stringValue
    default: return ""
    }
}

/// "If nobody answers in 3h, it goes with No" for a question with a deadline.
func automationAskDeadlineNote(_ ask: AutomationAsk, now: Date = Date()) -> String {
    guard let expiresAt = ask.expiresAt else { return "" }
    let left = max(0, expiresAt - Int(now.timeIntervalSince1970))
    let mins = max(1, Int((Double(left) / 60).rounded(.up)))
    let span = mins < 60 ? "\(mins)m"
        : mins < 1440 ? "\(Int((Double(mins) / 60).rounded()))h"
        : "\(Int((Double(mins) / 1440).rounded()))d"
    let lead = "If nobody answers in \(span)"
    if ask.questions.count == 1, let only = ask.questions.first, let d = only.defaultAnswer {
        return "\(lead), it goes with \(automationAskDisplay(only, d))"
    }
    guard ask.questions.allSatisfy({ $0.defaultAnswer != nil || $0.optional }) else {
        return "\(lead), the question closes"
    }
    return ask.questions.contains { $0.defaultAnswer != nil }
        ? "\(lead), it goes on with the defaults"
        : "\(lead), it goes on without an answer"
}

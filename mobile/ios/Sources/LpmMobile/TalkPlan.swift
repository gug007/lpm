import Foundation

/// Where a Talk plan starts its agent: in a new copy of the project, in a new
/// worktree of it, or in the project itself.
enum TalkPlace: String {
    case copy, worktree, here
}

/// What the Mac made of one spoken or typed request (`talkPlan`). The phone may
/// change the project, the agent and the prompt, and sends the whole plan back
/// with `talkRun`. Only from a Mac whose `features` has "talk".
struct TalkPlan: Equatable {
    /// Empty when the Mac couldn't tell which project was meant.
    var project: String
    let place: TalkPlace
    var agent: String
    var prompt: String
    let label: String

    init?(_ o: [String: Any]) {
        guard let place = (o["where"] as? String).flatMap(TalkPlace.init) else { return nil }
        self.place = place
        project = o["project"] as? String ?? ""
        agent = o["agent"] as? String ?? ""
        prompt = o["prompt"] as? String ?? ""
        label = o["label"] as? String ?? ""
    }

    var json: [String: Any] {
        ["project": project, "where": place.rawValue, "agent": agent, "prompt": prompt, "label": label]
    }

    /// Approve waits for a project and something to tell the agent.
    var canRun: Bool {
        !project.isEmpty && !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var stepCount: String { place == .here ? "2 steps" : "3 steps" }

    var placeTitle: String {
        switch place {
        case .copy: return "Duplicate"
        case .worktree: return "Worktree"
        case .here: return "In"
        }
    }

    /// The Start row: the agent, and where it starts when that isn't the project itself.
    func startLine(agent label: String) -> String {
        switch place {
        case .copy: return "\(label), in the copy"
        case .worktree: return "\(label), in the worktree"
        case .here: return label
        }
    }
}

/// One `talkPlan` reply: the plan, or why there is none. `unsupported` marks a
/// request a plan can't carry out, as opposed to a failure worth another try.
struct TalkPlanReply {
    let reqId: String
    let plan: TalkPlan?
    let candidates: [String]
    let error: String
    let unsupported: Bool

    init(_ o: [String: Any]) {
        reqId = o["reqId"] as? String ?? ""
        let ok = o["ok"] as? Bool ?? false
        plan = ok ? (o["plan"] as? [String: Any]).flatMap(TalkPlan.init) : nil
        candidates = o["candidates"] as? [String] ?? []
        error = o["error"] as? String ?? "The Mac couldn't do it."
        unsupported = !ok && o["unsupported"] as? Bool == true
    }
}

/// One `talkRun` reply. `error` is nil once the Mac has started the plan.
struct TalkRunReply {
    let reqId: String
    let error: String?

    init(_ o: [String: Any]) {
        reqId = o["reqId"] as? String ?? ""
        error = o["ok"] as? Bool == true ? nil : (o["error"] as? String ?? "The Mac couldn't do it.")
    }
}

extension Wire {
    static func talkPlan(reqId: String, text: String) -> String {
        json(["t": "talkPlan", "reqId": reqId, "text": text])
    }
    static func talkRun(reqId: String, plan: TalkPlan) -> String {
        json(["t": "talkRun", "reqId": reqId, "plan": plan.json])
    }
}

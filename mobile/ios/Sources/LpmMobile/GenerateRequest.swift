import Foundation

/// An agent's `lpm generate` waiting for a yes on the Mac (generate/approval.rs):
/// what it will make, from which prompt, for how much and where it goes. Only from
/// a Mac whose `features` has "generateApproval".
struct GenerateRequest: Identifiable, Equatable {
    let id: String
    let kind: String
    let agent: String
    let project: String
    let prompt: String
    let model: String
    let provider: String
    let details: [String]
    let cost: String
    let out: String
    let needsKey: String?
    let keyLabel: String
    let projectGrant: Bool
    let overLimit: Bool
    let today: String

    init?(_ o: [String: Any]) {
        guard let id = o["id"] as? String, !id.isEmpty else { return nil }
        self.id = id
        kind = o["kind"] as? String ?? "image"
        agent = o["agent"] as? String ?? ""
        project = o["project"] as? String ?? ""
        prompt = o["prompt"] as? String ?? ""
        model = o["model"] as? String ?? ""
        provider = o["provider"] as? String ?? ""
        details = o["details"] as? [String] ?? []
        cost = o["cost"] as? String ?? ""
        out = o["out"] as? String ?? ""
        needsKey = (o["needsKey"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        keyLabel = o["keyLabel"] as? String ?? ""
        projectGrant = o["projectGrant"] as? Bool ?? false
        overLimit = o["overLimit"] as? Bool ?? false
        today = o["today"] as? String ?? ""
    }

    var isSpeech: Bool { kind == "speech" }
    var who: String { agent.isEmpty ? "An agent" : agent }
    /// The project's yes is offered only once the key is there.
    var allowsProject: Bool { projectGrant && needsKey == nil }

    var title: String {
        if needsKey != nil {
            let article = keyLabel.first.map { "aeiouAEIOU".contains($0) } == true ? "an" : "a"
            return "Add \(article) \(keyLabel) key to make this \(isSpeech ? "audio" : "image")"
        }
        return "\(who) wants to make \(isSpeech ? "audio" : "an image")"
    }

    /// "Nano Banana 2.1 · Google · 16:9 · about 3¢".
    var facts: String {
        (["\(model) · \(provider)"] + details + [cost]).filter { !$0.isEmpty }.joined(separator: " · ")
    }

    var primaryLabel: String {
        if needsKey != nil { return "Save and continue" }
        return allowsProject ? "Allow in \(project)" : "Allow"
    }

    /// The decision the primary button sends.
    var primaryDecision: String { allowsProject ? "project" : "once" }

    static let getKeyURL: [String: URL] = [
        "gemini": URL(string: "https://aistudio.google.com/apikey")!,
        "openai": URL(string: "https://platform.openai.com/api-keys")!,
    ]
}

import Foundation

/// The `lpm generate` requests waiting on the live Mac. The Mac owns the list and
/// pushes it whenever it changes; this mirrors it and sends the answer back.
@Observable @MainActor
final class GenerateStore {
    @ObservationIgnored weak var model: AppModel?

    private(set) var requests: [GenerateRequest] = []
    /// The request whose answer is on its way.
    private(set) var answering: String?
    var error: String?
    /// Requests swiped away here; they stay open on the Mac.
    private var setAside: Set<String> = []

    /// The request the sheet shows: the oldest one not set aside.
    var shown: GenerateRequest? { requests.first { !setAside.contains($0.id) } }
    var waiting: Int { max(0, requests.count - 1) }

    // MARK: from the Mac

    func noteReady(features: Set<String>) {
        guard features.contains(LpmClient.generateApprovalFeature) else {
            requests = []
            return
        }
        model?.client?.requestGenerateRequests()
    }

    func apply(_ list: [GenerateRequest]) {
        requests = list
        let open = Set(list.map(\.id))
        setAside.formIntersection(open)
        if let answering, !open.contains(answering) { self.answering = nil }
    }

    func answered(id: String, error: String?) {
        if answering == id { answering = nil }
        self.error = error
        if error == nil { requests.removeAll { $0.id == id } }
    }

    func handleConnectionReset() {
        answering = nil
        error = nil
    }

    // MARK: to the Mac

    func answer(_ request: GenerateRequest, decision: String, prompt: String, key: String) {
        error = nil
        answering = request.id
        let edited = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        model?.client?.answerGenerate(id: request.id, decision: decision,
                                      prompt: edited.isEmpty || edited == request.prompt ? nil : edited,
                                      key: decision == "deny" ? nil : key.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    func setAside(_ request: GenerateRequest) {
        setAside.insert(request.id)
    }
}

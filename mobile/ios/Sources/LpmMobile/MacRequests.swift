import Foundation

enum MacRequestError: LocalizedError {
    case mac(String)
    case timedOut
    case disconnected

    var errorDescription: String? {
        switch self {
        case .mac(let message): return message
        case .timedOut: return "The Mac didn't answer in time."
        case .disconnected: return "Lost the connection to the Mac."
        }
    }
}

/// Matches each reply to the request waiting on it. The Mac answers these on a
/// worker, so replies can arrive out of order and are paired by `reqId`, not by
/// arrival.
@MainActor
final class MacRequests<Reply> {
    private let timeout: Duration
    private var waiting: [String: CheckedContinuation<Reply, Error>] = [:]

    init(timeout: Duration) {
        self.timeout = timeout
    }

    func request(_ send: (String) -> Void) async throws -> Reply {
        let reqId = UUID().uuidString
        return try await withCheckedThrowingContinuation { continuation in
            waiting[reqId] = continuation
            send(reqId)
            Task { [weak self, timeout] in
                try? await Task.sleep(for: timeout)
                self?.finish(reqId, .failure(MacRequestError.timedOut))
            }
        }
    }

    /// A reply, or the Mac's refusal when it carried none.
    func deliver(reqId: String, _ reply: Reply?, error: String?) {
        finish(reqId, reply.map { .success($0) } ?? .failure(MacRequestError.mac(error ?? "")))
    }

    func failAll() {
        for reqId in Array(waiting.keys) {
            finish(reqId, .failure(MacRequestError.disconnected))
        }
    }

    private func finish(_ reqId: String, _ result: Result<Reply, Error>) {
        waiting.removeValue(forKey: reqId)?.resume(with: result)
    }
}

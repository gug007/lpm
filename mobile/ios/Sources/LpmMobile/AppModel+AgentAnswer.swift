import Foundation

extension AppModel {
    /// Send a notification's answer over the live session, when that is with the
    /// notification's Mac. Nil means it isn't — or, for an Allow or Deny, that the
    /// session went quiet, which an errand connection can safely try again: the
    /// Mac takes only the first answer to a prompt. A reply isn't sent twice.
    func answerLive(_ answer: AgentAnswer) async -> AgentAnswerSender.Outcome? {
        guard case .ready = connection, let client, !client.isVerifying,
              client.hostFeatures.contains(LpmClient.answerAgentFeature),
              let record = activeRecord, record.via == nil,
              let serverId = record.serverId, serverId == answer.serverId
        else { return nil }
        let reqId = UUID().uuidString
        let reply: String?? = await withCheckedContinuation { continuation in
            answerWaiters[reqId] = continuation
            client.answerAgent(answer, reqId: reqId)
            DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [weak self] in
                self?.answerWaiters.removeValue(forKey: reqId)?.resume(returning: .none)
            }
        }
        switch reply {
        case .none:
            return answer.action == .reply ? .failed("Couldn't reach \(record.displayName).") : nil
        case .some(.none):
            return .sent
        case .some(.some(let error)):
            return .failed(error)
        }
    }

    func noteAnswerAgent(reqId: String, error: String?) {
        if agentDialogs.applyAnswer(reqId: reqId, error: error) { return }
        answerWaiters.removeValue(forKey: reqId)?.resume(returning: .some(error))
    }
}

import Foundation

/// Demo handlers for Lock or Sleep: the demo Mac can do both, two of its agents
/// are working, and it takes every choice without actually sleeping.
extension DemoServer {
    private static let powerAgents = 2

    func registerPowerHandlers() {
        register("power") { [weak self] _ in self?.pushPower() }
        register("lockScreen") { [weak self] _ in self?.answerPower("lockScreen") }
        register("sleepNow") { [weak self] _ in self?.answerPower("sleepNow") }
        register("sleepWhenIdle") { [weak self] o in
            guard let self else { return }
            self.world.powerArmed = o["on"] as? Bool ?? true
            self.answerPower("sleepWhenIdle", state: true)
            self.pushPower()
        }
    }

    private func answerPower(_ t: String, state: Bool = false) {
        pushAfter(0.2) { [weak self] in
            guard let self else { return nil }
            var reply: [String: Any] = ["t": t, "ok": true]
            if state { reply["state"] = self.powerState() }
            return reply
        }
    }

    private func pushPower() {
        pushAfter(0.2) { [weak self] in
            self.map { ["t": "power", "state": $0.powerState()] }
        }
    }

    private func powerState() -> [String: Any] {
        ["lock": true, "sleep": true, "armed": world.powerArmed,
         "agents": Self.powerAgents, "automations": 0]
    }
}

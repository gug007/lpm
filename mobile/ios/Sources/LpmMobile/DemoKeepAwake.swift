import Foundation

/// Demo handlers for Keep awake: the demo Mac starts kept awake while two of its
/// agents work, and takes every change the menus make.
extension DemoServer {
    private static let keepAwakeModes: Set<String> = ["off", "agents", "timed", "always"]
    private static let keepAwakeAgents = 2

    func registerKeepAwakeHandlers() {
        register("keepAwake") { [weak self] _ in self?.pushKeepAwake() }
        register("keepAwakeSet") { [weak self] o in
            guard let self else { return }
            let mode = o["mode"] as? String ?? ""
            let minutes = o["minutes"] as? Int ?? 0
            let error: String? = {
                if !Self.keepAwakeModes.contains(mode) { return "Unknown Keep awake mode \"\(mode)\"." }
                if mode == "timed" && !(1...5999).contains(minutes) {
                    return "Pick a time between 1 minute and 99 hours 59 minutes."
                }
                return nil
            }()
            if error == nil {
                self.world.keepAwakeMode = mode
                self.world.keepAwakeEndsAt = mode == "timed" ? Date().addingTimeInterval(Double(minutes) * 60) : nil
            }
            self.pushAfter(0.2) { [weak self] in
                guard let self else { return nil }
                var reply: [String: Any] = ["t": "keepAwakeSet", "ok": error == nil, "state": self.keepAwakeState()]
                if let error { reply["error"] = error }
                return reply
            }
            if error == nil { self.pushKeepAwake() }
        }
    }

    private func pushKeepAwake() {
        pushAfter(0.2) { [weak self] in
            self.map { ["t": "keepAwake", "state": $0.keepAwakeState()] }
        }
    }

    private func keepAwakeState() -> [String: Any] {
        if let end = world.keepAwakeEndsAt, end <= Date() {
            world.keepAwakeMode = "off"
            world.keepAwakeEndsAt = nil
        }
        let mode = world.keepAwakeMode
        let endsIn: Any = world.keepAwakeEndsAt.map { Int(($0.timeIntervalSince(Date()) * 1000).rounded()) } ?? NSNull()
        return [
            "supported": true,
            "screenSupported": true,
            "mode": mode,
            "active": mode != "off",
            "agents": mode == "agents" ? Self.keepAwakeAgents : 0,
            "endsIn": endsIn,
            "tailMinutes": 5,
            "screen": true,
            "battery": true,
            "floor": 20,
            "power": mode == "off" ? "idle" : "awake",
        ]
    }
}

import Foundation

/// Demo handlers for Keep awake: the demo Mac starts kept awake while two of its
/// agents work, and takes every change the menus make.
extension DemoServer {
    private static let keepAwakeModes: Set<String> = ["off", "agents", "timed", "always"]
    private static let keepAwakeAgents = 2
    private static let keepAwakeMinutes = 1...5999
    private static let keepAwakeTimeError = "Pick a time between 1 minute and 99 hours 59 minutes."

    func registerKeepAwakeHandlers() {
        register("keepAwake") { [weak self] _ in self?.pushKeepAwake() }
        register("keepAwakeSet") { [weak self] o in
            guard let self else { return }
            let mode = o["mode"] as? String ?? ""
            let minutes = o["minutes"] as? Int ?? 0
            let error = mode == "extend" ? self.extendKeepAwake(minutes) : self.setKeepAwake(mode, minutes)
            self.pushAfter(0.2) { [weak self] in
                guard let self else { return nil }
                var reply: [String: Any] = ["t": "keepAwakeSet", "ok": error == nil, "state": self.keepAwakeState()]
                if let error { reply["error"] = error }
                return reply
            }
            if error == nil { self.pushKeepAwake() }
        }
    }

    private func setKeepAwake(_ mode: String, _ minutes: Int) -> String? {
        if !Self.keepAwakeModes.contains(mode) { return "Unknown Keep awake mode \"\(mode)\"." }
        if mode == "timed" && !Self.keepAwakeMinutes.contains(minutes) { return Self.keepAwakeTimeError }
        world.keepAwakeMode = mode
        world.keepAwakeEndsAt = mode == "timed" ? Date().addingTimeInterval(Double(minutes) * 60) : nil
        return nil
    }

    /// Adds to a set time that is running, as the Mac does. The demo's agents never
    /// finish, so it has no after-agents countdown to add to.
    private func extendKeepAwake(_ minutes: Int) -> String? {
        guard Self.keepAwakeMinutes.contains(minutes) else { return Self.keepAwakeTimeError }
        let now = Date()
        guard world.keepAwakeMode == "timed", let end = world.keepAwakeEndsAt, end > now else {
            return "Keep awake isn't counting down, so there's no time to add to."
        }
        let latest = now.addingTimeInterval(Double(Self.keepAwakeMinutes.upperBound) * 60)
        world.keepAwakeEndsAt = min(end.addingTimeInterval(Double(minutes) * 60), latest)
        return nil
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

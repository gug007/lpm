import Foundation

/// The lpm release a Mac runs, from its `paired` and `ready` frames.
struct MacBuild: Equatable {
    var version: String
    /// Only a release build on macOS replaces itself, so only then can this
    /// iPhone update it.
    var selfUpdate: Bool

    init?(_ o: [String: Any]) {
        guard let version = o["version"] as? String, !version.isEmpty else { return nil }
        self.version = version
        selfUpdate = o["selfUpdate"] as? Bool ?? false
    }
}

/// Where an install on the Mac stands. Always the whole state, never a delta.
struct MacUpdateStep: Equatable {
    enum Phase: String {
        case idle, checking, downloading, installing
    }

    var phase: Phase
    /// Whole percent while downloading; -1 until the size is known.
    var progress: Int

    init(_ o: [String: Any]) {
        phase = Phase(rawValue: o["phase"] as? String ?? "") ?? .idle
        progress = o["progress"] as? Int ?? -1
    }
}

/// The `updateCheck` reply: the newest release, and the install running now.
/// A failed check still says what the Mac is doing.
struct MacUpdateCheck {
    var currentVersion: String?
    var latestVersion: String?
    var updateAvailable: Bool
    var error: String?
    var step: MacUpdateStep

    init(_ o: [String: Any]) {
        let ok = o["ok"] as? Bool ?? false
        error = ok ? nil : o["error"] as? String ?? "The check didn't go through."
        currentVersion = ok ? o["currentVersion"] as? String : nil
        latestVersion = ok ? o["latestVersion"] as? String : nil
        updateAvailable = ok && (o["updateAvail"] as? Bool ?? false)
        step = MacUpdateStep(o)
    }
}

/// A project where agents are mid-task, which the restart an update ends in
/// would cut off.
struct BusyAgentPlace: Identifiable, Equatable {
    var id: String
    var label: String
    var count: Int
}

func busyAgentPlaces(_ projects: [Project]) -> [BusyAgentPlace] {
    projects.compactMap { project in
        let count = project.busyAgents()
        return count > 0 ? BusyAgentPlace(id: project.name, label: project.label, count: count) : nil
    }
}

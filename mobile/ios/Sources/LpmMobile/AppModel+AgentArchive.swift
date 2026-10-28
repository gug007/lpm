import Foundation

/// Agents archived on this phone that can still be undone: hidden here, not yet
/// archived on the Mac. Archiving another while the banner is up joins this one.
struct PendingAgentArchive: Equatable {
    struct Agent: Equatable {
        let project: String
        let keys: [String]
        let title: String
    }

    var agents: [Agent]

    var message: String {
        agents.count == 1 ? "Archived “\(agents[0].title)”" : "Archived \(agents.count) agents"
    }
}

/// Seen and archived agents (`agentArchive`): a finished agent stays listed, gray
/// once it has been opened, until it's archived.
extension AppModel {
    /// The Mac archives agents and lists the seen ones it keeps.
    var canArchiveAgents: Bool {
        client?.hostFeatures.contains(LpmClient.agentArchiveFeature) == true
    }

    func wireAgentArchive(_ c: LpmClient) {
        c.onSeenAgentsShown = { [weak self] shown in self?.seenAgentsShown = shown }
        c.onKeepFinishedAgents = { [weak self] keep in self?.keepFinishedAgents = keep }
    }

    /// The status keys of `project` an archive waiting on its undo hides.
    func archivingAgentKeys(_ project: String) -> Set<String> {
        Set(pendingAgentArchive?.agents.filter { $0.project == project }.flatMap(\.keys) ?? [])
    }

    /// Archive a finished agent's row. It leaves the list at once but reaches the
    /// Mac only once the undo window passes, which another archive restarts.
    func archiveAgent(_ row: ProjectAgentRow, project: String) {
        guard canArchiveAgents, row.state.isFinished else { return }
        Haptics.tap()
        pendingAgentArchiveWork?.cancel()
        var pending = pendingAgentArchive ?? PendingAgentArchive(agents: [])
        pending.agents.append(.init(project: project, keys: row.keys, title: row.title))
        pendingAgentArchive = pending
        let work = DispatchWorkItem { [weak self] in self?.finishPendingAgentArchive() }
        pendingAgentArchiveWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.undoCloseSeconds, execute: work)
    }

    func undoAgentArchive() {
        takePendingAgentArchive()
    }

    /// Send an archive still waiting on its undo now. Its rows leave the list
    /// for good here too, so they can't flash back before status-changed lands.
    func finishPendingAgentArchive() {
        guard let pending = takePendingAgentArchive() else { return }
        for (project, agents) in Dictionary(grouping: pending.agents, by: \.project) {
            let keys = agents.flatMap(\.keys)
            let archived = { (entry: StatusEntry) in
                keys.contains(entry.key) && AgentState.of(entry.value).isFinished
            }
            updateAgentEntries(project) { live, seen in
                (live.filter { !archived($0) }, seen.filter { !archived($0) })
            }
            client?.archiveStatus(project: project, keys: keys)
        }
    }

    /// Mark a finished row seen without opening it. Only offered while the Mac
    /// keeps finished agents; otherwise the Mac archives it.
    func markAgentSeen(_ row: ProjectAgentRow, project: String) {
        guard canArchiveAgents else { return }
        Haptics.tap()
        settleAgentStatus(project) { row.keys.contains($0.key) && AgentState.of($0.value).isFinished }
        client?.markStatusSeen(project: project, keys: row.keys)
    }

    /// Take a seen row back to new. No notification comes for it again.
    func markAgentUnread(_ row: ProjectAgentRow, project: String) {
        guard canArchiveAgents else { return }
        Haptics.tap()
        updateAgentEntries(project) { live, seen in
            let unread = seen.filter { row.keys.contains($0.key) }
            return (live + unread.map { $0.seen(at: 0) }, seen.filter { !row.keys.contains($0.key) })
        }
        client?.markStatusUnread(project: project, keys: row.keys)
    }

    /// Take finished statuses off a project's list as the Mac is about to: into
    /// its seen agents when it keeps finished agents, else gone.
    func settleAgentStatus(_ project: String, where settles: (StatusEntry) -> Bool) {
        let now = Int(Date().timeIntervalSince1970 * 1000)
        let keepsSeen = canArchiveAgents && keepFinishedAgents
        updateAgentEntries(project) { live, seen in
            let settled = live.filter(settles)
            return (live.filter { !settles($0) }, keepsSeen ? seen + settled.map { $0.seen(at: now) } : seen)
        }
    }

    @discardableResult
    private func takePendingAgentArchive() -> PendingAgentArchive? {
        pendingAgentArchiveWork?.cancel()
        pendingAgentArchiveWork = nil
        defer { pendingAgentArchive = nil }
        return pendingAgentArchive
    }

    private func updateAgentEntries(
        _ project: String,
        _ change: (_ live: [StatusEntry], _ seen: [StatusEntry]) -> ([StatusEntry], [StatusEntry])
    ) {
        guard let idx = projects.firstIndex(where: { $0.name == project }) else { return }
        let (live, seen) = change(projects[idx].statusEntries, projects[idx].seenEntries)
        projects[idx] = projects[idx].withStatus(live, seen: seen)
    }
}

private extension StatusEntry {
    func seen(at millis: Int) -> StatusEntry {
        var entry = self
        entry.seenAt = millis
        return entry
    }
}

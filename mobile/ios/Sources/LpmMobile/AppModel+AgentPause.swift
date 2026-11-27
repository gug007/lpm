import Foundation

/// Marking a paused agent finished (`finishPaused`): the Mac publishes the finish it
/// is holding, and the row turns Done once status-changed lands.
extension AppModel {
    var canFinishPausedAgents: Bool {
        client?.hostFeatures.contains(LpmClient.finishPausedFeature) == true
    }

    func finishPausedAgent(_ row: ProjectAgentRow, project: String) {
        guard canFinishPausedAgents, row.pause != nil else { return }
        Haptics.tap()
        client?.finishPaused(project: project, keys: row.keys)
    }
}

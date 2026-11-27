package cx.lpm.mobile.core.data.projects

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.finishPaused
import cx.lpm.mobile.core.model.ProjectAgentRow

/*
 * Marking a paused agent finished (`finishPaused`): the Mac publishes the finish it is
 * holding, and the row turns Done once status-changed lands.
 */

val ProjectsStore.canFinishPausedAgents: Boolean
    get() = client?.hostFeatures?.contains(LpmClient.FINISH_PAUSED_FEATURE) == true

fun ProjectsStore.finishPausedAgent(row: ProjectAgentRow, project: String) {
    if (!canFinishPausedAgents || row.pause == null) return
    client?.finishPaused(project, row.keys)
}

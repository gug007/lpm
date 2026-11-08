package cx.lpm.mobile.core.data.share

import cx.lpm.mobile.core.data.mac.MacRecord
import cx.lpm.mobile.core.model.ShareAgent
import cx.lpm.mobile.core.model.ShareMac
import cx.lpm.mobile.core.model.ShareProject

/**
 * This saved Mac as the share sheet reaches it, offering [projects] and [agents]; null
 * for a Mac reached only through another, or one that hasn't said its server id.
 */
fun MacRecord.toShareMac(
    projects: List<ShareProject> = emptyList(),
    agents: List<ShareAgent> = emptyList()
): ShareMac? {
    if (via != null) return null
    val serverId = serverId ?: return null
    return ShareMac(
        localId = localId,
        serverId = serverId,
        name = displayName,
        hosts = hosts,
        port = port,
        projects = projects,
        agents = agents
    )
}

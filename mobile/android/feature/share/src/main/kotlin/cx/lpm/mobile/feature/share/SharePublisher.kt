package cx.lpm.mobile.feature.share

import cx.lpm.mobile.core.data.agents.AgentLaunchStore
import cx.lpm.mobile.core.data.di.ApplicationScope
import cx.lpm.mobile.core.data.projects.ProjectsState
import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionState
import cx.lpm.mobile.core.data.share.ShareDirectoryStore
import cx.lpm.mobile.core.data.share.ShareOutbox
import cx.lpm.mobile.core.data.share.toShareMac
import cx.lpm.mobile.core.model.AgentOption
import cx.lpm.mobile.core.model.ShareAgent
import cx.lpm.mobile.core.model.ShareMac
import cx.lpm.mobile.core.model.ShareProject
import cx.lpm.mobile.core.push.ShareNotices
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/**
 * Keeps the share sheet's directory current and sends what it kept for later whenever
 * the app comes back or the link does (iOS `ShareDirectoryPublisher`).
 */
@Singleton
class SharePublisher @Inject constructor(
    private val session: MacSession,
    private val directories: ShareDirectoryStore,
    private val outbox: ShareOutbox,
    private val notices: ShareNotices,
    @param:ApplicationScope private val scope: CoroutineScope
) {
    /** The live Mac as the sheet lists it, and the Macs still saved. */
    internal data class Update(val mac: ShareMac?, val keeping: Set<String>)

    fun start() {
        val projects = session.store<ProjectsStore>()
        val agents = session.store<AgentLaunchStore>()
        scope.launch {
            combine(session.state, projects.state, agents.state) { state, list, launch ->
                // Demo Mode's Mac isn't one the sheet can reach, nor are its Macs saved.
                if (state.demoMode) return@combine null
                val mac = shareDirectoryMac(state, list, launch.options, agents.canLaunchAgents)
                val direct = state.macs.filter { it.via == null }
                Update(mac, direct.mapNotNull { it.serverId }.toSet())
            }
                .filterNotNull()
                .distinctUntilChanged()
                .collect { directories.save(directories.load().updating(it.mac, it.keeping)) }
        }
        scope.launch {
            session.state.map { it.isReady }.distinctUntilChanged().filter { it }.collect {
                val unlisted = agents.state.value.options == null
                if (agents.canLaunchAgents && unlisted) agents.loadOptions()
                sendWaiting()
            }
        }
        scope.launch { session.foreground.filter { it }.collect { sendWaiting() } }
    }

    private fun sendWaiting() {
        val state = session.state.value
        if (state.demoMode) return
        scope.launch { outbox.sendWaiting(state.macs, notices::show) }
    }
}

/**
 * The live Mac as the share sheet lists it (iOS `AppModel.shareDirectoryMac`): where to
 * reach it, its local projects and the agents a new tab can start. Null in Demo Mode,
 * before the Mac's list arrives, and for a Mac this phone reaches only through another.
 */
internal fun shareDirectoryMac(
    state: SessionState,
    projects: ProjectsState,
    options: List<AgentOption>?,
    canLaunchAgents: Boolean
): ShareMac? {
    if (state.demoMode || !projects.projectsLoaded) return null
    val record = state.activeRecord ?: return null
    val agents = if (canLaunchAgents) options.orEmpty() else emptyList()
    return record.toShareMac(
        // An SSH project's agents can't read a path on the Mac.
        projects = projects.projects.filter {
            !it.isRemote
        }.map { ShareProject(it.name, it.label) },
        agents = agents.map { ShareAgent(it.id, it.label) }
    )
}

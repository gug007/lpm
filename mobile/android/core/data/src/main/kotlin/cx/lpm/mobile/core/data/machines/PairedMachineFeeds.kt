package cx.lpm.mobile.core.data.machines

import cx.lpm.mobile.core.data.client.LpmClientFactory
import cx.lpm.mobile.core.data.di.ApplicationScope
import cx.lpm.mobile.core.data.link.HostProber
import cx.lpm.mobile.core.data.mac.CredentialStore
import cx.lpm.mobile.core.data.mac.MacRecord
import cx.lpm.mobile.core.data.mac.ThisDevice
import cx.lpm.mobile.core.data.prefs.AppPreferences
import cx.lpm.mobile.core.data.prefs.PreferenceKeys
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionState
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.model.RemoteMachine
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update

/** A saved machine's projects as last listed, and how its link is doing. */
data class MachineFeed(val projects: List<Project>? = null, val state: State = State.Connecting) {
    enum class State { Connecting, Ready, Offline }
}

/** What a saved machine's section says under its name while it isn't answering. */
enum class MachineFeedNote { Connecting, NotAnswering }

/**
 * Show All Machines (iOS `PairedMachineFeeds` + `AppModel+AllMachines`): the other
 * machines saved on this phone, kept connected while the projects list shows all of
 * them and the app is on screen, so each one's projects and agents list as a section
 * under the live Mac's own. A link only reads the project list: it subscribes to no
 * terminal and takes control of nothing, and it tells its Mac the phone is away, so
 * that Mac still sends its notifications. Their projects open as machine visits.
 */
@Singleton
class PairedMachineFeeds @Inject constructor(
    private val session: MacSession,
    private val prefs: AppPreferences,
    private val credentials: CredentialStore,
    clients: LpmClientFactory,
    prober: HostProber,
    device: ThisDevice,
    @param:ApplicationScope private val scope: CoroutineScope
) {
    private val env = FeedLinkEnvironment(scope, clients, prober, credentials, device.name)
    private val importer: MachineImporter = session.store()
    private val links = mutableMapOf<String, MachineFeedLink>()
    private val mutableFeeds = MutableStateFlow<Map<String, MachineFeed>>(emptyMap())

    /** Saved machine localId → its feed, while it's kept connected. */
    val feeds: StateFlow<Map<String, MachineFeed>> = mutableFeeds.asStateFlow()

    val enabled: StateFlow<Boolean> = prefs.data
        .map { readEnabled() }
        .distinctUntilChanged()
        .stateIn(scope, SharingStarted.Eagerly, readEnabled())

    /** Every machine section the list shows: the live Mac's own, then the others saved here. */
    val listedSections: Flow<List<MachineSection>> =
        combine(importer.sections, session.state, enabled, feeds) { own, s, on, feeds ->
            own + if (on) pairedSections(s, own, feeds) else emptyList()
        }.distinctUntilChanged()

    init {
        combine(session.state, importer.sections, enabled, session.foreground) { s, own, on, fg ->
            if (on && fg && !s.demoMode) otherSavedMachines(s, own) else emptyList()
        }
            .distinctUntilChanged()
            .onEach(::keep)
            .launchIn(scope)
        session.foreground.drop(1).filter { it }.onEach { retryNow() }.launchIn(scope)
    }

    fun setEnabled(on: Boolean) = prefs.setBool(PreferenceKeys.ALL_MACHINES, on)

    /** One listed section, the live Mac's own or a saved machine's, as it stands now. */
    fun section(slug: String): MachineSection? {
        importer.section(slug)?.let { return it }
        if (!enabled.value) return null
        val s = session.state.value
        val own = machineSections(s, importer.state.value)
        return pairedSections(s, own, feeds.value).firstOrNull { it.id == slug }
    }

    private fun readEnabled(): Boolean = prefs.bool(PreferenceKeys.ALL_MACHINES) ?: false

    /** Keep exactly `records` connected, opening the new ones and closing the rest. */
    private fun keep(records: List<MacRecord>) {
        val wanted = records.associateBy { it.localId }
        for (id in links.keys - wanted.keys) {
            links.remove(id)?.stop()
            mutableFeeds.update { it - id }
        }
        for ((id, record) in wanted) {
            if (id in links) continue
            val credential = credentials.load(id) ?: continue
            mutableFeeds.update { it + (id to MachineFeed()) }
            val link = MachineFeedLink(record, credential, env) { apply(id, it) }
            links[id] = link
            link.start()
        }
    }

    private fun retryNow() = links.values.toList().forEach { it.retryNow() }

    private fun apply(id: String, update: MachineFeedLink.Update) {
        if (id !in links) return
        mutableFeeds.update { feeds ->
            val feed = feeds[id] ?: MachineFeed()
            val next = when (update) {
                is MachineFeedLink.Update.State -> feed.copy(state = update.state)

                is MachineFeedLink.Update.Projects ->
                    feed.copy(projects = update.projects, state = MachineFeed.State.Ready)
            }
            feeds + (id to next)
        }
    }
}

/**
 * Other machines this phone could list: paired with it directly, not the live Mac,
 * and not already one of the live Mac's own sections.
 */
fun otherSavedMachines(s: SessionState, own: List<MachineSection>): List<MacRecord> {
    if (s.demoMode) return emptyList()
    val shownByLiveMac = own.mapNotNull { it.machine.serverId }.toSet()
    return s.macs.filter { mac ->
        mac.localId != s.activeMacId && mac.via == null &&
            mac.serverId?.let { it in shownByLiveMac } != true
    }
}

/** Whether the title menu offers Show All Machines. */
fun SessionState.canShowAllMachines(): Boolean =
    !demoMode && macs.any { it.localId != activeMacId && it.via == null }

/** The other machines' sections, in the order they were saved. */
fun pairedSections(
    s: SessionState,
    own: List<MachineSection>,
    feeds: Map<String, MachineFeed>
): List<MachineSection> = otherSavedMachines(s, own).mapNotNull { mac ->
    val feed = feeds[mac.localId] ?: return@mapNotNull null
    val machine = RemoteMachine(
        slug = "saved:" + mac.localId,
        name = mac.displayName,
        platform = mac.platform,
        serverId = mac.serverId,
        state = if (feed.state == MachineFeed.State.Ready) {
            RemoteMachine.State.Ready
        } else {
            RemoteMachine.State.Offline
        },
        projects = feed.projects,
        relay = false
    )
    MachineSection(
        machine = machine,
        rows = machineRows(feed.projects.orEmpty()),
        record = mac,
        pending = null,
        throughMac = false,
        note = when (feed.state) {
            MachineFeed.State.Ready -> null

            MachineFeed.State.Connecting -> MachineFeedNote.Connecting.takeIf {
                feed.projects ==
                    null
            }

            MachineFeed.State.Offline -> MachineFeedNote.NotAnswering
        }
    )
}

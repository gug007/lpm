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
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/** A saved machine's projects as last listed, and how its link is doing. */
data class MachineFeed(val projects: List<Project>? = null, val state: State = State.Connecting) {
    enum class State { Connecting, Ready, Offline }
}

/** What a saved machine's section says under its name while it isn't answering. */
enum class MachineFeedNote { Connecting, NotAnswering }

/**
 * The machines ticked in the title menu and the ones cleared there; [showedAll] is
 * Show All Machines as it was left before there were ticks.
 */
data class MachineChoices(
    val ticked: Set<String> = emptySet(),
    val cleared: Set<String> = emptySet(),
    val showedAll: Boolean = false
) {
    /**
     * Whether the list shows a saved machine: the live Mac always, then what the menu
     * ticked or cleared. One never touched there shows as it did before there was a
     * choice: the machines connected to the live Mac ([own]), and the rest where Show
     * All Machines was on.
     */
    fun shows(mac: MacRecord, s: SessionState, own: List<MachineSection>): Boolean = when {
        mac.localId == s.activeMacId || mac.localId in ticked -> true
        mac.localId in cleared -> false
        else -> own.any { it.record?.localId == mac.localId } || (showedAll && mac.via == null)
    }

    fun with(macId: String, shown: Boolean): MachineChoices = if (shown) {
        copy(ticked = ticked + macId, cleared = cleared - macId)
    } else {
        copy(ticked = ticked - macId, cleared = cleared + macId)
    }
}

/**
 * Choosing the machines the projects list shows (iOS `PairedMachineFeeds` +
 * `AppModel+AllMachines`): the title menu ticks them, and each ticked one lists as a
 * section, the live Mac's own machines in their slots and the others saved on this
 * phone under them, kept connected while the app is on screen. A link only reads the
 * project list: it subscribes to no terminal and takes control of nothing, and it
 * tells its Mac the phone is away, so that Mac still sends its notifications. Their
 * projects open as machine visits.
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

    val choices: StateFlow<MachineChoices> = prefs.data
        .map { readChoices() }
        .distinctUntilChanged()
        .stateIn(scope, SharingStarted.Eagerly, readChoices())

    /** The saved machines the list shows, the live Mac among them, by localId. */
    val shownIds: Flow<Set<String>> =
        combine(session.state, importer.sections, choices, ::shownIds).distinctUntilChanged()

    /** Every machine section the list shows: the live Mac's own, then the others saved here. */
    val listedSections: Flow<List<MachineSection>> =
        combine(importer.sections, session.state, choices, feeds) { own, s, choices, feeds ->
            shownSections(s, own, choices) + pairedSections(s, own, feeds, choices)
        }.distinctUntilChanged()

    init {
        combine(session.state, importer.sections, choices, session.foreground) {
                s,
                own,
                choices,
                fg
            ->
            if (fg) otherSavedMachines(s, own, choices) else emptyList()
        }
            .distinctUntilChanged()
            .onEach(::keep)
            .launchIn(scope)
        combine(session.state, importer.sections, choices, ::openedThroughLiveMac)
            .distinctUntilChanged()
            .onEach { slugs -> slugs.forEach(importer::pairDirectly) }
            .launchIn(scope)
        session.foreground.drop(1).filter { it }.onEach { retryNow() }.launchIn(scope)
    }

    /**
     * Tick or clear a machine in the title menu. Clearing the live Mac moves the
     * connection to the first machine still ticked; the last one stays ticked.
     */
    fun toggle(macId: String) {
        val s = session.state.value
        val own = ownSections(s)
        val now = choices.value
        if (macId != s.activeMacId) {
            val mac = s.macs.firstOrNull { it.localId == macId } ?: return
            write(now.with(macId, shown = !now.shows(mac, s, own)))
            return
        }
        val next = s.macs.firstOrNull { it.localId != macId && now.shows(it, s, own) } ?: return
        write(now.with(macId, shown = false))
        session.switchTo(next)
    }

    /** One listed section, the live Mac's own or a saved machine's, as it stands now. */
    fun section(slug: String): MachineSection? {
        importer.section(slug)?.let { return it }
        val s = session.state.value
        return pairedSections(s, ownSections(s), feeds.value, choices.value)
            .firstOrNull { it.id == slug }
    }

    private fun ownSections(s: SessionState) = machineSections(s, importer.state.value)

    private fun readChoices() = MachineChoices(
        ticked = readIds(PreferenceKeys.SHOWN_MACHINES),
        cleared = readIds(PreferenceKeys.HIDDEN_MACHINES),
        showedAll = prefs.bool(PreferenceKeys.ALL_MACHINES) ?: false
    )

    private fun readIds(key: String): Set<String> {
        val raw = prefs.string(key) ?: return emptySet()
        val list = runCatching { Json.parseToJsonElement(raw) as? JsonArray }.getOrNull()
        return list.orEmpty().mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.toSet()
    }

    private fun write(choices: MachineChoices) {
        writeIds(PreferenceKeys.SHOWN_MACHINES, choices.ticked)
        writeIds(PreferenceKeys.HIDDEN_MACHINES, choices.cleared)
    }

    private fun writeIds(key: String, ids: Set<String>) =
        prefs.setString(key, JsonArray(ids.sorted().map(::JsonPrimitive)).toString())

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

/** The saved machines the list shows, the live Mac among them, by localId. */
fun shownIds(s: SessionState, own: List<MachineSection>, choices: MachineChoices): Set<String> =
    s.macs.filter { choices.shows(it, s, own) }.map { it.localId }.toSet()

/**
 * The live Mac's own machines the list shows. One that isn't saved here yet has no
 * tick to clear.
 */
fun shownSections(
    s: SessionState,
    own: List<MachineSection>,
    choices: MachineChoices
): List<MachineSection> = own.filter { section ->
    section.record?.let { choices.shows(it, s, own) } ?: true
}

/**
 * Listed machines saved here without a pairing of their own, that the live Mac can
 * get a pairing code from right now.
 */
fun openedThroughLiveMac(
    s: SessionState,
    own: List<MachineSection>,
    choices: MachineChoices
): List<String> = shownSections(s, own, choices)
    .filter { it.record?.via != null && it.machine.state == RemoteMachine.State.Ready }
    .map { it.id }

/**
 * Ticked machines the phone lists itself: paired with it directly, not the live Mac,
 * and not already one of the live Mac's own sections.
 */
fun otherSavedMachines(
    s: SessionState,
    own: List<MachineSection>,
    choices: MachineChoices
): List<MacRecord> {
    if (s.demoMode) return emptyList()
    val shownByLiveMac = own.mapNotNull { it.machine.serverId }.toSet()
    return s.macs.filter { mac ->
        mac.localId != s.activeMacId && mac.via == null && choices.shows(mac, s, own) &&
            mac.serverId?.let { it in shownByLiveMac } != true
    }
}

/** The other machines' sections, in the order they were saved. */
fun pairedSections(
    s: SessionState,
    own: List<MachineSection>,
    feeds: Map<String, MachineFeed>,
    choices: MachineChoices
): List<MachineSection> = otherSavedMachines(s, own, choices).mapNotNull { mac ->
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

package cx.lpm.mobile.core.data.push

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.prefs.notificationPrefs
import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.data.terminals.TerminalsStore
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.model.StatusEntry
import java.time.LocalTime
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * An agent you aren't looking at starting to wait while lpm Link is on screen (iOS
 * `WaitingHeadsUp`). The Mac doesn't push to a phone showing the app, so the phone says
 * so itself: [banner], which `:core:push` posts as a heads-up on the Waiting channel.
 * One per Waiting report, never for the tab on screen, several at once collapsed into
 * one, with the same levels, Waiting switch and quiet hours a push would get.
 */
class WaitingHeadsUp(private val session: MacSession) : SessionStore {
    private val mutable = MutableStateFlow<WaitingBanner?>(null)

    /** What the banner says now; null takes it away. */
    val banner: StateFlow<WaitingBanner?> = mutable.asStateFlow()

    /** The terminal open on screen, which never gets a banner. */
    var terminalOnScreen: String? = null
        private set

    // The waits the banner stands for, oldest first.
    private var waits: List<HeadsUpWait> = emptyList()

    // Waiting reports already told, so a refresh never tells one twice.
    private val told = mutableSetOf<String>()

    // Projects whose status has loaded since the link came up: their first load only
    // records what already waits, which the list shows anyway.
    private val known = mutableSetOf<String>()

    override fun wire(client: LpmClient) {
        session.store<ProjectsStore>().onStatusApplied = ::statusChanged
    }

    override fun reset() = onConnectionReset()

    override fun onConnectionReset() {
        known.clear()
        waits = emptyList()
        mutable.value = null
    }

    /** [id] came on screen: opening the tab that waits takes it out of the banner. */
    fun showTerminal(id: String) {
        terminalOnScreen = id
        if (waits.none { it.terminalId == id }) return
        waits = waits.filterNot { it.terminalId == id }
        repost(alert = false)
    }

    fun hideTerminal(id: String) {
        if (terminalOnScreen == id) terminalOnScreen = null
    }

    /** A project's status, as it was before this update. */
    fun statusChanged(project: Project, before: List<StatusEntry>) {
        val firstLoad = known.add(project.name)
        val waiting = project.statusEntries.filter { it.value == WAITING && it.paneID.isNotEmpty() }
        val stillWaiting = waiting.map { it.paneID }.toSet()
        val gone = { wait: HeadsUpWait ->
            wait.project == project.name && wait.terminalId !in stillWaiting
        }
        val ended = waits.any(gone)
        waits = waits.filterNot(gone)
        val fresh = waiting.filter { told.add(report(it, project.name)) }
        if (firstLoad) return
        val announce = fresh.filter { entry ->
            entry.paneID != terminalOnScreen &&
                before.none { old ->
                    old.key == entry.key && old.timestamp == entry.timestamp && old.value == WAITING
                }
        }
        if (announce.isEmpty() || !allows(project)) {
            if (ended) repost(alert = false)
            return
        }
        val labels = session.store<TerminalsStore>().state.value.terminals[project.name].orEmpty()
        for (entry in announce) {
            waits = waits.filterNot { it.terminalId == entry.paneID } + HeadsUpWait(
                project = project.name,
                projectLabel = project.label.ifEmpty { project.name },
                terminalId = entry.paneID,
                terminal = labels.firstOrNull { it.id == entry.paneID }?.label.orEmpty(),
                key = entry.key,
                ts = entry.timestamp
            )
        }
        repost(alert = true)
    }

    /**
     * What a Waiting push for this project would get: the app on screen, the Waiting
     * switch on, the project not turned off (a copy follows its original), and outside
     * quiet hours.
     */
    private fun allows(project: Project): Boolean {
        val prefs = session.preferences.notificationPrefs
        if (!session.foreground.value || !prefs.enabled || !prefs.waiting) return false
        val level = prefs.projects[project.name]
            ?: if (project.isDuplicate) prefs.projects[project.parentName] else null
        if (level == LEVEL_OFF) return false
        return !prefs.quiet.quiets(WAITING, LocalTime.now(session.env.clock))
    }

    private fun repost(alert: Boolean) {
        val serverId = session.state.value.activeRecord?.serverId?.takeIf { it.isNotEmpty() }
        mutable.value = if (waits.isEmpty()) null else WaitingBanner(waits, serverId, alert)
    }

    private companion object {
        const val WAITING = "Waiting"
        const val LEVEL_OFF = "off"

        fun report(entry: StatusEntry, project: String) =
            "$project\n${entry.key}\n${entry.timestamp}"
    }
}

/** One agent the banner says needs you. */
data class HeadsUpWait(
    val project: String,
    val projectLabel: String,
    val terminalId: String,
    /** The tab's label; empty when the terminal list doesn't hold it. */
    val terminal: String,
    val key: String,
    val ts: Long
)

/**
 * The banner as it stands: [waits] oldest first, and [alert] when one just started
 * waiting (a sound and a pop-up), not when one dropped out.
 */
data class WaitingBanner(val waits: List<HeadsUpWait>, val serverId: String?, val alert: Boolean) {
    /** The wait a tap opens and a withdrawal follows. */
    val newest: HeadsUpWait get() = waits.last()

    /** "storefront · Claude" for each wait, newest first, as several collapse into one. */
    val lines: List<String>
        get() = waits.reversed().map {
            if (it.terminal.isEmpty()) it.projectLabel else "${it.projectLabel} · ${it.terminal}"
        }
}

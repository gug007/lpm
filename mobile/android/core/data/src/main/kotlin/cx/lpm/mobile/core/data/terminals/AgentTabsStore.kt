package cx.lpm.mobile.core.data.terminals

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.requestAnswers
import cx.lpm.mobile.core.data.mac.AgentTabSnapshots
import cx.lpm.mobile.core.data.mac.LastAnswer
import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.session.MacRequests
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.core.protocol.AnswersReply
import java.time.Instant
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/** What the phone kept of an agent tab, for reading it while the Mac is away. */
data class SavedAgentTab(val screen: AgentTabSnapshots.Screen?, val answer: LastAnswer?) {
    /** When it was last current. */
    val lastSeen: Instant?
        get() = listOfNotNull(screen?.at, answer?.at).maxOrNull()?.let(Instant::ofEpochMilli)
}

/**
 * The agent tabs kept for when the Mac is away (iOS `AppModel+AgentTabs`): their lists
 * as the Mac sends them, the screens the terminals hand over, and the answer each
 * finished turn ended on.
 */
class AgentTabsStore(private val session: MacSession) : SessionStore {
    private val kept get() = session.env.agentTabs
    private val requests = MacRequests<AnswersReply>(REPLY_MS)

    // The finish each tab's answer was last asked for, by when it ended.
    private val asked = mutableMapOf<String, Long>()
    private var following: Job? = null

    private val keeps: Boolean
        get() = !session.state.value.demoMode && !session.isVisit &&
            !session.link.state.value.pairing

    private val macId: String? get() = session.state.value.activeMacId
    private val widgetId: String? get() = session.state.value.activeRecord?.widgetId

    override fun wire(client: LpmClient) {
        client.onTerminalsFrame = { frame, text ->
            val mac = macId
            if (client === session.client && client.deviceId != null && keeps && mac != null) {
                kept.record(frame, text, mac)
            }
        }
        client.onAnswers = { requests.deliver(it.reqId, it) }
        if (following == null) {
            following = session.scope.launch {
                liveProjects().collect { projectsChanged(it) }
            }
        }
    }

    override fun reset() {
        following?.cancel()
        following = null
        forgetRequests()
    }

    override fun onConnectionReset() = forgetRequests()

    private fun forgetRequests() {
        requests.failAll()
        asked.clear()
    }

    /** The agent tabs of a project this phone has something to show of. */
    suspend fun savedTabs(project: String): List<TerminalInfo> {
        val mac = macId?.takeIf { keeps } ?: return emptyList()
        return kept.readableTabs(project, mac, widgetId)
    }

    suspend fun saved(terminal: String): SavedAgentTab? {
        val mac = macId?.takeIf { keeps } ?: return null
        val answer = widgetId?.let { kept.loadAnswers(it) }?.get(terminal)
        val screen = kept.screen(terminal, mac)
        return SavedAgentTab(screen, answer).takeIf { screen != null || answer != null }
    }

    /** Whether this tab's screen is worth keeping: an agent's, on the Mac itself. */
    fun keepsScreen(terminal: TerminalInfo): Boolean = keeps && terminal.cli.isNotEmpty()

    fun keepScreen(terminal: String, text: String, at: Long, mac: String) {
        val state = session.state.value
        if (state.demoMode || session.isVisit || text.isEmpty()) return
        if (state.macs.any { it.localId == mac }) kept.saveScreen(text, at, terminal, mac)
    }

    /** The Mac's list each time it's live and changed: one restored from disk says nothing new. */
    private fun liveProjects(): Flow<List<Project>> = combine(
        session.store<ProjectsStore>().state.map { it.projects },
        session.state.map { it.isReady },
        session.link.state.map { it.listAsOf == null }
    ) { projects, ready, live -> projects.takeIf { ready && live } }
        .distinctUntilChanged()
        .filterNotNull()

    private fun CoroutineScope.projectsChanged(projects: List<Project>) {
        val mac = macId?.takeIf { keeps } ?: return
        if (projects.isNotEmpty()) kept.keep(projects.map { it.name }.toSet(), mac)
        keepFinishedAnswers(projects)
    }

    /**
     * Ask for the answer of each turn that finished since the phone last had one, a few
     * at a time: the newest are the ones worth reading later.
     */
    private fun CoroutineScope.keepFinishedAnswers(projects: List<Project>) {
        val mac = widgetId ?: return
        if (session.client?.hostFeatures?.contains(LpmClient.AGENT_ANSWERS_FEATURE) != true) return
        val newest = projects.filterNot { it.isRemote }.flatMap { project ->
            (project.statusEntries + project.seenEntries)
                .filter { it.value == "Done" && it.paneID.isNotEmpty() && hasTranscript(it.key) }
                .filter { asked[it.paneID] != it.timestamp }
                .map { Finish(project.name, it.paneID, it.timestamp) }
        }.sortedByDescending { it.at }.take(MAX_ASKED)
        if (newest.isEmpty()) return
        newest.forEach { asked[it.terminal] = it.at }
        launch {
            val known = kept.loadAnswers(mac)
            val due = newest.filter { known[it.terminal]?.lacks(it.at) ?: true }
            if (due.isEmpty()) return@launch
            // The transcript settles a moment after the finish is reported.
            delay(SETTLE_MS)
            val answers = mutableMapOf<String, LastAnswer>()
            for (finish in due) {
                if (widgetId != mac || !session.state.value.isReady) break
                ask(finish)?.let { answers[finish.terminal] = LastAnswer(it, finish.at) }
            }
            if (widgetId == mac) kept.recordAnswers(mac, answers)
        }
    }

    private suspend fun ask(finish: Finish): String? = requests.request {
        session.client?.requestAnswers(finish.terminal, finish.project, limit = 1, reqId = it)
    }?.newest

    /** An agent whose transcript the Mac reads. */
    private fun hasTranscript(key: String) =
        key.startsWith("claude_code") || key.startsWith("codex")

    private data class Finish(val project: String, val terminal: String, val at: Long)

    private companion object {
        const val MAX_ASKED = 8
        const val SETTLE_MS = 2_000L
        const val REPLY_MS = 20_000L
    }
}

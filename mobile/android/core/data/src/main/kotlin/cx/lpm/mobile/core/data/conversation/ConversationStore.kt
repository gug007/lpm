package cx.lpm.mobile.core.data.conversation

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.requestConversationDetail
import cx.lpm.mobile.core.data.client.requestConversationPage
import cx.lpm.mobile.core.data.client.unwatchConversation
import cx.lpm.mobile.core.data.client.watchConversation
import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.session.MacRequests
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.data.terminals.TerminalsState
import cx.lpm.mobile.core.data.terminals.TerminalsStore
import cx.lpm.mobile.core.model.AgentState
import cx.lpm.mobile.core.model.ConversationItem
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.model.agentRow
import cx.lpm.mobile.core.protocol.ConversationDetailReply
import cx.lpm.mobile.core.protocol.ConversationPageReply
import java.util.UUID
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

private val READABLE = setOf("claude", "codex")

/**
 * Whether the screen of [terminal] can show its conversation: an agent's whose
 * transcript the Mac reads. An SSH project's is on its server, and another computer's
 * tab keeps its own.
 */
fun MacSession.offersConversation(
    terminals: TerminalsState,
    project: Project?,
    terminal: String
): Boolean {
    val reads = client?.hostFeatures?.contains(LpmClient.AGENT_CONVERSATION_FEATURE) == true
    if (!reads || project == null || project.isRemote) return false
    val tab = terminals.terminals[project.name]?.firstOrNull { it.id == terminal } ?: return false
    return tab.cli in READABLE && !tab.remote
}

/**
 * The conversations of agent tabs (iOS `ConversationStore`): pushed by the Mac while a
 * tab's Conversation view is on screen, and kept while the app runs so going back to
 * it shows what was there.
 */
class ConversationStore(private val session: MacSession) : SessionStore {
    private val mutable = MutableStateFlow(ConversationState())
    val state: StateFlow<ConversationState> = mutable.asStateFlow()

    /** The terminals on screen: their project, and how many screens show each. */
    private val watched = mutableMapOf<String, Watch>()
    private val pages = MacRequests<ConversationPageReply>(REQUEST_TIMEOUT_MS)
    private val parts = MacRequests<ConversationDetailReply>(REQUEST_TIMEOUT_MS)

    private data class Watch(val project: String, val screens: Int)

    private val client: LpmClient? get() = session.client

    override fun wire(client: LpmClient) {
        client.onConversation = { update ->
            if (update.id.isNotEmpty()) edit(update.id) { it.with(update) }
        }
        client.onConversationPage = { pages.deliver(it.reqId, it) }
        client.onConversationDetail = { parts.deliver(it.reqId, it) }
        session.store<TerminalsStore>().onSubmitted = ::noteSent
    }

    override fun reset() {
        mutable.value = ConversationState()
        failRequests()
    }

    /** The Mac forgets a dropped connection's watch. */
    override fun onReady(client: LpmClient) {
        watched.forEach { (id, watch) -> client.watchConversation(id, watch.project) }
    }

    override fun onConnectionReset() {
        mutable.update { s ->
            s.copy(
                lists = s.lists.mapValues { (_, list) -> list.copy(loadingEarlier = false) },
                details = s.details.mapValues { (_, detail) ->
                    detail.takeUnless { it == ConversationDetail.Loading }
                        ?: ConversationDetail.Failed(DISCONNECTED)
                }
            )
        }
        failRequests()
    }

    private fun failRequests() {
        pages.failAll()
        parts.failAll()
    }

    /** A screen showing the conversation came up; [unwatch] when it goes. */
    fun watch(terminal: String, project: String) {
        watched[terminal] = Watch(project, (watched[terminal]?.screens ?: 0) + 1)
        client?.watchConversation(terminal, project)
    }

    fun unwatch(terminal: String) {
        val watch = watched[terminal] ?: return
        if (watch.screens > 1) {
            watched[terminal] = watch.copy(screens = watch.screens - 1)
        } else {
            watched.remove(terminal)
            client?.unwatchConversation(terminal)
        }
    }

    fun loadEarlier(terminal: String, project: String) {
        val list = state.value.lists[terminal] ?: return
        val first = list.items.firstOrNull() ?: return
        val client = client ?: return
        if (!list.more || list.loadingEarlier) return
        edit(terminal) { it.copy(loadingEarlier = true) }
        session.scope.launch {
            val reply = pages.request {
                client.requestConversationPage(terminal, project, first.id, it)
            }
            val page = reply?.page
            if (state.value.lists[terminal]?.loadingEarlier != true) return@launch
            edit(terminal) { list ->
                // Only what still goes before the list as it is now.
                if (page == null || list.items.firstOrNull()?.id != first.id) {
                    list.copy(loadingEarlier = false)
                } else {
                    list.copy(
                        items = page.items + list.items,
                        more = page.more,
                        loadingEarlier = false
                    )
                }
            }
        }
    }

    /** What an opened call shows: asked for again once it ends, when it has more to show. */
    fun loadDetail(terminal: String, project: String, item: ConversationItem) {
        val key = detailKey(terminal, item)
        when (state.value.details[key]) {
            ConversationDetail.Loading, is ConversationDetail.Parts -> return
            is ConversationDetail.Failed, null -> Unit
        }
        val client = client ?: return
        setDetail(key, ConversationDetail.Loading)
        session.scope.launch {
            val reply = parts.request {
                client.requestConversationDetail(terminal, project, item.id, it)
            }
            if (state.value.details[key] != ConversationDetail.Loading) return@launch
            val loaded = reply?.parts
            setDetail(
                key,
                if (loaded != null) {
                    ConversationDetail.Parts(loaded)
                } else {
                    ConversationDetail.Failed(reply?.error ?: TIMED_OUT)
                }
            )
        }
    }

    /**
     * Shows a prompt sent from here until the transcript has it: an agent at work
     * takes it only once it gets to it.
     */
    fun noteSent(terminal: String, text: String) {
        val project = watched[terminal]?.project ?: return
        val prompt = text.trim().takeIf { it.isNotEmpty() } ?: return
        val pending = PendingPrompt(UUID.randomUUID().toString(), prompt)
        edit(terminal) { it.copy(sending = it.sending + pending) }
        session.scope.launch {
            do {
                delay(SENDING_LAPSE_MS)
            } while (isWorking(project, terminal))
            edit(terminal) { list ->
                list.copy(sending = list.sending.filterNot { it.id == pending.id })
            }
        }
    }

    private fun isWorking(project: String, terminal: String): Boolean {
        val shown = session.store<ProjectsStore>().state.value.project(project) ?: return false
        return agentRow(shown, terminal, now = 0)?.state == AgentState.Working
    }

    private fun edit(terminal: String, change: (ConversationList) -> ConversationList) =
        mutable.update { s ->
            val next = change(s.lists[terminal] ?: ConversationList())
            s.copy(lists = s.lists + (terminal to next))
        }

    private fun setDetail(key: String, detail: ConversationDetail) =
        mutable.update { it.copy(details = it.details + (key to detail)) }

    companion object {
        private const val REQUEST_TIMEOUT_MS = 20_000L

        // How long a prompt sent to an agent that isn't working may take to show up.
        private const val SENDING_LAPSE_MS = 12_000L
        private const val TIMED_OUT = "The Mac didn't answer in time."
        private const val DISCONNECTED = "Lost the connection to the Mac."

        /** A call that finishes has more to show than it did. */
        fun detailKey(terminal: String, item: ConversationItem): String =
            "$terminal/${item.id}/${item.tool?.state}"
    }
}

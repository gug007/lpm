package cx.lpm.mobile.core.data.commands

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.changeLpmCommandFolder
import cx.lpm.mobile.core.data.client.convertSkill
import cx.lpm.mobile.core.data.client.deleteLpmCommand
import cx.lpm.mobile.core.data.client.expandLpmCommand
import cx.lpm.mobile.core.data.client.noteCommandUsed
import cx.lpm.mobile.core.data.client.moveOtherSkill
import cx.lpm.mobile.core.data.client.requestLpmCommands
import cx.lpm.mobile.core.data.client.saveLpmCommand
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.CommandRef
import cx.lpm.mobile.core.model.CommandScope
import cx.lpm.mobile.core.model.ExpandedCommand
import cx.lpm.mobile.core.model.LpmCommandLists
import cx.lpm.mobile.core.model.OtherSpot
import cx.lpm.mobile.core.protocol.CommandFolderOp
import cx.lpm.mobile.core.protocol.LpmCommandsInbound
import java.util.UUID
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/** Both lists per project ("" outside one), and what is loading or failed. */
data class LpmCommandsState(
    val lists: Map<String, LpmCommandLists> = emptyMap(),
    val loading: Set<String> = emptySet(),
    val loadError: Map<String, String> = emptyMap(),
    /** Bumped on every change push, so a `/` menu asks for its rows again. */
    val revision: Int = 0
)

/** What a request came back with: the reply, or the sentence saying why there is none. */
sealed interface CommandOutcome<out T> {
    data class Done<T>(val value: T) : CommandOutcome<T>

    data class Failed(val error: String) : CommandOutcome<Nothing>
}

/**
 * The user's lpm commands per project, and the requests that read, change and run
 * them (iOS `LpmCommandsStore`). Every verb runs on a worker on the Mac (an SSH
 * project's list is a round trip to its host), so replies pair with their request
 * by `reqId`.
 */
class LpmCommandsStore(private val session: MacSession) : SessionStore {
    private val mutable = MutableStateFlow(LpmCommandsState())
    val state: StateFlow<LpmCommandsState> = mutable.asStateFlow()

    private val client: LpmClient? get() = session.client
    private val waiting = mutableMapOf<String, CompletableDeferred<LpmCommandsInbound.Reply?>>()

    // Projects a screen is showing (counted, as a screen and its editor overlap), so
    // a change push or a reconnect refreshes just those.
    private val watched = mutableMapOf<String, Int>()

    /** The Mac can file other skills in folders and convert them. */
    val otherSkillsAvailable: Boolean
        get() = client?.hostFeatures?.contains(LpmClient.LPM_OTHER_SKILLS_FEATURE) == true

    /** The Mac can keep folders inside folders. */
    val nestedFoldersAvailable: Boolean
        get() = client?.hostFeatures?.contains(LpmClient.LPM_NESTED_FOLDERS_FEATURE) == true

    /** The Mac keeps lpm commands: its `features` has "lpmCommands". */
    val available: Boolean
        get() = client?.hostFeatures?.contains(LpmClient.LPM_COMMANDS_FEATURE) == true

    override fun wire(client: LpmClient) {
        client.onLpmCommands = ::receive
    }

    override fun reset() {
        failAll()
        watched.clear()
        mutable.value = LpmCommandsState()
    }

    /** The socket was replaced: nothing in flight can still answer. */
    override fun onConnectionReset() {
        failAll()
        mutable.update { it.copy(loading = emptySet()) }
        watched.keys.toList().forEach(::load)
    }

    /**
     * A screen shows [project]. The first one fetches its lists (nobody refreshed them
     * while none showed); one over it relies on the change push and pull to refresh.
     */
    fun open(project: String) {
        val count = (watched[project] ?: 0) + 1
        watched[project] = count
        if (count == 1 || project !in state.value.lists) load(project)
    }

    fun close(project: String) {
        val n = watched[project] ?: return
        if (n > 1) watched[project] = n - 1 else watched.remove(project)
    }

    fun load(project: String) {
        if (project in state.value.loading) return
        mutable.update { it.copy(loading = it.loading + project) }
        session.scope.launch {
            val outcome = request { c, reqId -> c.requestLpmCommands(project, reqId) }
            mutable.update { s ->
                val done = s.copy(loading = s.loading - project)
                when (outcome) {
                    is CommandOutcome.Done -> done.copy(
                        lists = outcome.value.lists?.let { s.lists + (project to it) } ?: s.lists,
                        loadError = s.loadError - project
                    )

                    is CommandOutcome.Failed ->
                        if (project in s.lists) {
                            done
                        } else {
                            done.copy(loadError = s.loadError + (project to outcome.error))
                        }
                }
            }
        }
    }

    /**
     * Creates a command, or with [previous] edits that one: a new name, folder or list
     * moves its file.
     */
    suspend fun save(
        project: String,
        place: CommandRef,
        description: String,
        body: String,
        previous: CommandRef?,
        keepOutOfGit: Boolean? = null
    ): CommandOutcome<Unit> = change(project) { c, reqId ->
        c.saveLpmCommand(project, reqId, place, description, body, previous, keepOutOfGit)
    }

    suspend fun delete(project: String, target: CommandRef): CommandOutcome<Unit> =
        change(project) { c, reqId -> c.deleteLpmCommand(project, reqId, target) }

    /** Moves a skill not made in lpm: [OtherSpot] says where. */
    suspend fun moveOther(
        project: String,
        scope: CommandScope,
        name: String,
        spot: OtherSpot
    ): CommandOutcome<Unit> = change(project) { c, reqId ->
        c.moveOtherSkill(project, reqId, scope, name, spot.folder, spot.root)
    }

    /** Turns a skill not made in lpm into one of lpm's, or one of lpm's back. */
    suspend fun convert(
        project: String,
        scope: CommandScope,
        name: String,
        toLpm: Boolean
    ): CommandOutcome<Unit> = change(project) { c, reqId ->
        c.convertSkill(project, reqId, scope, name, toLpm)
    }

    suspend fun folder(
        project: String,
        op: CommandFolderOp,
        scope: CommandScope,
        name: String,
        newName: String? = null
    ): CommandOutcome<Unit> = change(project) { c, reqId ->
        c.changeLpmCommandFolder(project, reqId, op, scope, name, newName)
    }

    /**
     * What `/name args` sends in [cli], worked out by the Mac that holds the project: the
     * agent's own call for the skill when it can run it, else the prompt.
     */
    suspend fun expand(
        project: String,
        name: String,
        args: String,
        cli: String
    ): CommandOutcome<ExpandedCommand> = when (
        val outcome = request { c, reqId ->
            c.expandLpmCommand(project, reqId, name, args, cli)
        }
    ) {
        is CommandOutcome.Done ->
            CommandOutcome.Done(outcome.value.expanded ?: ExpandedCommand("", emptyList()))

        is CommandOutcome.Failed -> outcome
    }

    /** Counts a sent `/` command that isn't an lpm skill, for the menu's Most used. */
    fun noteCommandUsed(project: String, name: String) {
        val client = client ?: return
        if (LpmClient.LPM_COMMAND_USED_FEATURE in client.hostFeatures) {
            client.noteCommandUsed(project, name)
        }
    }

    private fun receive(frame: LpmCommandsInbound) {
        when (frame) {
            is LpmCommandsInbound.Reply -> waiting.remove(frame.reqId)?.complete(frame)
            is LpmCommandsInbound.Changed -> changed(frame.project)
        }
    }

    /**
     * A command or folder changed somewhere: in the global list ([project] ""), which
     * every project shows, or in [project]'s own. The lists on screen it touches are
     * fetched again.
     */
    private fun changed(project: String) {
        mutable.update { it.copy(revision = it.revision + 1) }
        watched.keys.filter { project.isEmpty() || it == project }.forEach(::load)
    }

    private suspend fun change(
        project: String,
        send: (LpmClient, String) -> Unit
    ): CommandOutcome<Unit> = when (val outcome = request(send)) {
        is CommandOutcome.Done -> {
            outcome.value.lists?.let { fresh ->
                mutable.update { it.copy(lists = it.lists + (project to fresh)) }
            }
            CommandOutcome.Done(Unit)
        }

        is CommandOutcome.Failed -> outcome
    }

    private suspend fun request(
        send: (LpmClient, String) -> Unit
    ): CommandOutcome<LpmCommandsInbound.Reply> {
        val c = client ?: return CommandOutcome.Failed(DISCONNECTED)
        val reqId = UUID.randomUUID().toString()
        val reply = CompletableDeferred<LpmCommandsInbound.Reply?>()
        waiting[reqId] = reply
        val frame = try {
            send(c, reqId)
            withTimeoutOrNull(TIMEOUT_MS) { reply.await() } ?: return CommandOutcome.Failed(
                if (reply.isCompleted) DISCONNECTED else TIMED_OUT
            )
        } finally {
            waiting.remove(reqId)
        }
        return frame.error?.let { CommandOutcome.Failed(it) } ?: CommandOutcome.Done(frame)
    }

    private fun failAll() {
        waiting.values.forEach { it.complete(null) }
        waiting.clear()
    }

    companion object {
        const val TIMED_OUT = "The Mac didn't answer in time."
        const val DISCONNECTED = "Lost the connection to the Mac."
        private const val TIMEOUT_MS = 30_000L
    }
}

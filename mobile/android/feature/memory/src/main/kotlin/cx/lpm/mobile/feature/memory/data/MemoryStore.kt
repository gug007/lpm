package cx.lpm.mobile.feature.memory.data

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.deleteMemorySession
import cx.lpm.mobile.core.data.client.requestMemory
import cx.lpm.mobile.core.data.client.requestMemorySession
import cx.lpm.mobile.core.data.client.saveMemorySession
import cx.lpm.mobile.core.data.session.GenerationTimeout
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.Haptic
import cx.lpm.mobile.core.model.MemoryList
import cx.lpm.mobile.core.model.MemorySession
import cx.lpm.mobile.core.model.next
import java.time.Clock
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Session memory for every project and the operations that drive it (iOS
 * `MemoryStore`). Every reply is answered off a worker on the Mac and can land out of
 * order, so each handler is guarded on the echoed project (and session name).
 */
class MemoryStore(private val session: MacSession, private val clock: Clock = Clock.systemUTC()) :
    SessionStore {
    private val mutable = MutableStateFlow(MemoryState())
    val state: StateFlow<MemoryState> = mutable.asStateFlow()

    private val client: LpmClient? get() = session.client
    private val timeout = GenerationTimeout<String>(session.scope)

    // The screen showing and the session it has open, so a reconnect replays them.
    private var activeProject: String? = null

    // Screens showing per project. A pushed page opens before the one under it closes,
    // so the project stays active until the last of them goes.
    private val openScreens = mutableMapOf<String, Int>()
    private val openName = mutableMapOf<String, String>()

    // Unsaved edits: a live refresh must not overwrite the draft under the user's
    // fingers (the save's compare-and-swap catches the clash).
    private val editingKeys = mutableSetOf<String>()

    // Saves that are creates, so the reply can report the new name to the list.
    private val creatingKeys = mutableSetOf<String>()

    // What each in-flight save carries; the reply echoes only the name.
    private val pendingSave = mutableMapOf<String, String>()
    private val changedWork = mutableMapOf<String, Job>()

    override fun wire(client: LpmClient) {
        client.onMemory = ::applyList
        client.onMemorySession = ::applySession
        client.onMemorySave = ::finishSave
        client.onMemoryDelete = ::finishDelete
        client.onMemoryChanged = ::changed
    }

    override fun reset() {
        timeout.cancelAll()
        changedWork.values.forEach { it.cancel() }
        changedWork.clear()
        activeProject = null
        openScreens.clear()
        openName.clear()
        editingKeys.clear()
        creatingKeys.clear()
        pendingSave.clear()
        mutable.value = MemoryState()
    }

    /**
     * The socket was replaced: nothing in flight can still answer, so drop the
     * spinners and re-issue whatever the user is actually looking at.
     */
    override fun onConnectionReset() {
        timeout.cancelAll()
        mutable.update {
            it.copy(
                listLoading = emptySet(),
                documentLoading = emptySet(),
                saving = emptySet(),
                deleting = emptySet()
            )
        }
        val project = activeProject ?: return
        load(project)
        openName[project]?.let { openSession(project, it) }
    }

    // screen lifecycle

    fun screenDidOpen(project: String) {
        openScreens[project] = (openScreens[project] ?: 0) + 1
        activeProject = project
        load(project)
    }

    fun screenDidClose(project: String) {
        val open = (openScreens[project] ?: 0) - 1
        if (open > 0) {
            openScreens[project] = open
            return
        }
        openScreens.remove(project)
        if (activeProject == project) activeProject = null
    }

    fun sessionDidClose(project: String, name: String) {
        if (openName[project] == name) openName.remove(project)
        editingKeys.remove(memoryKey(project, name))
    }

    fun beginEditing(project: String, name: String) {
        editingKeys += memoryKey(project, name)
    }

    fun endEditing(project: String, name: String) {
        editingKeys -= memoryKey(project, name)
    }

    // operations

    fun load(project: String) {
        if (project in state.value.listLoading) return
        mutable.update {
            it.copy(listLoading = it.listLoading + project, listError = it.listError - project)
        }
        client?.requestMemory(project)
        arm(LIST, project, READ_TIMEOUT_MS) {
            if (project !in state.value.listLoading) return@arm
            mutable.update {
                val error = it.listError + (project to UNREACHABLE)
                it.copy(
                    listLoading = it.listLoading - project,
                    listError = if (project in it.lists) it.listError else error
                )
            }
        }
    }

    /** Fetch one session's full markdown (the list only carries a preview). */
    fun openSession(project: String, name: String) {
        val k = memoryKey(project, name)
        openName[project] = name
        if (k in state.value.documentLoading) return
        mutable.update {
            it.copy(documentLoading = it.documentLoading + k, documentError = it.documentError - k)
        }
        client?.requestMemorySession(project, name)
        arm(DOC, k, READ_TIMEOUT_MS) {
            if (k !in state.value.documentLoading) return@arm
            mutable.update {
                val error = it.documentError + (k to OPEN_FAILED)
                it.copy(
                    documentLoading = it.documentLoading - k,
                    documentError = if (k in it.documents) it.documentError else error
                )
            }
        }
    }

    /**
     * Save an edited session. [baseline] is the text the phone loaded: the write lands
     * only if the file still reads exactly like that, so an agent CLI writing the same
     * file first is caught instead of overwritten.
     */
    fun save(project: String, name: String, content: String, baseline: String?) {
        val k = memoryKey(project, name)
        if (k in state.value.saving) return
        mutable.update {
            it.copy(
                saving = it.saving + k,
                saveError = it.saveError - k,
                conflictNotice = it.conflictNotice - k
            )
        }
        pendingSave[k] = content
        client?.saveMemorySession(project, name, content, baseline)
        arm(SAVE, k, WRITE_TIMEOUT_MS) {
            if (k !in state.value.saving) return@arm
            mutable.update { it.copy(saving = it.saving - k) }
            setSaveError(k, "Saving timed out. Check your Mac and try again.")
        }
    }

    /**
     * Create a new session. Unlike [save] this carries no baseline, so it also
     * overwrites a file an agent created between the two screens.
     */
    fun create(project: String, name: String, content: String) {
        creatingKeys += memoryKey(project, name)
        save(project, name, content, baseline = null)
    }

    fun delete(project: String, name: String) {
        val k = memoryKey(project, name)
        if (k in state.value.deleting) return
        mutable.update { it.copy(deleting = it.deleting + k, deleteError = it.deleteError - k) }
        client?.deleteMemorySession(project, name)
        arm(DELETE, k, WRITE_TIMEOUT_MS) {
            if (k !in state.value.deleting) return@arm
            mutable.update {
                it.copy(
                    deleting = it.deleting - k,
                    deleteError = it.deleteError + (k to "Deleting timed out. Try again.")
                )
            }
        }
    }

    fun consumeConflict(project: String, name: String) =
        mutable.update { it.copy(conflictNotice = it.conflictNotice - memoryKey(project, name)) }

    fun consumeCreated(project: String) =
        mutable.update { it.copy(createdName = it.createdName - project) }

    fun consumeSaveError(project: String, name: String) =
        mutable.update { it.copy(saveError = it.saveError - memoryKey(project, name)) }

    fun consumeDeleteError(project: String, name: String) =
        mutable.update { it.copy(deleteError = it.deleteError - memoryKey(project, name)) }

    // reply handlers

    private fun applyList(project: String, list: MemoryList?, error: String?) {
        timeout.cancel(timeoutKey(LIST, project))
        mutable.update {
            val loading = it.listLoading - project
            if (list != null) {
                it.copy(
                    listLoading = loading,
                    lists = it.lists + (project to list),
                    listError = it.listError - project
                )
            } else {
                it.copy(
                    listLoading = loading,
                    listError = it.listError + (project to (error ?: LIST_FAILED))
                )
            }
        }
    }

    private fun applySession(project: String, name: String, doc: MemorySession?, error: String?) {
        val k = memoryKey(project, name)
        timeout.cancel(timeoutKey(DOC, k))
        mutable.update {
            val loading = it.documentLoading - k
            if (doc != null) {
                it.copy(
                    documentLoading = loading,
                    documents = it.documents + (k to doc),
                    documentRevision = it.documentRevision + (k to it.documentRevision.bump(k)),
                    documentError = it.documentError - k
                )
            } else {
                it.copy(
                    documentLoading = loading,
                    documentError = it.documentError + (k to (error ?: DOC_FAILED))
                )
            }
        }
    }

    private fun finishSave(project: String, name: String, error: String?) {
        val k = memoryKey(project, name)
        timeout.cancel(timeoutKey(SAVE, k))
        mutable.update { it.copy(saving = it.saving - k) }
        val wasCreate = creatingKeys.remove(k)
        val saved = pendingSave.remove(k)
        // The Mac reports a lost compare-and-swap as the bare literal "modified"; the
        // user never sees that word — the draft is dropped and the latest reloaded.
        if (error == MODIFIED) {
            editingKeys -= k
            mutable.update {
                it.copy(
                    conflictNotice = it.conflictNotice + (k to CONFLICT),
                    feedback = it.feedback.next(Haptic.Error)
                )
            }
            openSession(project, name)
            load(project)
            return
        }
        if (error != null) {
            setSaveError(k, error)
            return
        }
        editingKeys -= k
        mutable.update { s ->
            val updated = saved?.let { text -> s.documents[k]?.replacingContent(text) }
            s.copy(
                savedTick = s.savedTick + (k to s.savedTick.bump(k)),
                documents = if (updated != null) s.documents + (k to updated) else s.documents,
                createdName = if (wasCreate) s.createdName + (project to name) else s.createdName,
                feedback = s.feedback.next(Haptic.Success)
            )
        }
        load(project)
    }

    private fun finishDelete(project: String, name: String, error: String?) {
        val k = memoryKey(project, name)
        timeout.cancel(timeoutKey(DELETE, k))
        if (error != null) {
            mutable.update {
                it.copy(
                    deleting = it.deleting - k,
                    deleteError = it.deleteError + (k to error),
                    feedback = it.feedback.next(Haptic.Error)
                )
            }
            return
        }
        mutable.update {
            it.copy(
                deleting = it.deleting - k,
                deletedTick = it.deletedTick + (k to it.deletedTick.bump(k)),
                documents = it.documents - k,
                documentError = it.documentError - k,
                feedback = it.feedback.next(Haptic.Success)
            )
        }
        sessionDidClose(project, name)
        load(project)
    }

    /**
     * A `memory-changed` push. [owner] is the folder that changed, which for a
     * duplicate is its original — refresh every project pointing at it, plus a
     * project of that name whose owner isn't known yet. Coalesced so an agent writing
     * in bursts triggers one refresh.
     */
    fun changed(owner: String) {
        changedWork.remove(owner)?.cancel()
        changedWork[owner] = session.scope.launch {
            delay(CHANGED_DEBOUNCE_MS)
            changedWork.remove(owner)
            refreshOwner(owner)
        }
    }

    private fun refreshOwner(owner: String) {
        val s = state.value
        val targets = s.lists.keys.filter { it == owner || s.owner(it) == owner }.toMutableSet()
        activeProject?.let { if (it == owner || s.owner(it) == owner) targets += it }
        for (project in targets) {
            load(project)
            // The open document too, unless it has unsaved edits — those stay, and the
            // save's compare-and-swap reports the clash.
            val name = openName[project] ?: continue
            if (memoryKey(project, name) !in editingKeys) openSession(project, name)
        }
    }

    private fun setSaveError(k: String, message: String) = mutable.update {
        val changed = it.saveError[k] != message
        it.copy(
            saveError = it.saveError + (k to message),
            feedback = if (changed) it.feedback.next(Haptic.Error) else it.feedback
        )
    }

    /** The same session carrying text the Mac has just accepted. */
    private fun MemorySession.replacingContent(text: String) = copy(
        updatedAt = clock.instant().epochSecond,
        size = text.toByteArray().size,
        content = text
    )

    private fun arm(op: String, key: String, millis: Long, fire: () -> Unit) =
        timeout.arm(timeoutKey(op, key), millis, fire)

    private fun timeoutKey(op: String, key: String) = op + "\u0000" + key

    private companion object {
        const val LIST = "list"
        const val DOC = "doc"
        const val SAVE = "save"
        const val DELETE = "delete"
        const val READ_TIMEOUT_MS = 25_000L
        const val WRITE_TIMEOUT_MS = 30_000L
        const val CHANGED_DEBOUNCE_MS = 500L
        const val MODIFIED = "modified"
        const val UNREACHABLE = "Couldn't reach your Mac. Pull to refresh."
        const val OPEN_FAILED = "Couldn't open this session. Try again."
        const val LIST_FAILED = "Couldn't load session memory."
        const val DOC_FAILED = "Couldn't open this session."
        const val CONFLICT = "Changed on your Mac by an agent — reloaded the latest version."
    }
}

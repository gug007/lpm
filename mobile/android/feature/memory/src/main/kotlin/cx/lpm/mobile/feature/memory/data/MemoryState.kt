package cx.lpm.mobile.feature.memory.data

import cx.lpm.mobile.core.model.HapticCue
import cx.lpm.mobile.core.model.MemoryList
import cx.lpm.mobile.core.model.MemorySession

/** Keys a session within a project: `project + "\n" + name`. */
fun memoryKey(project: String, name: String): String = project + "\n" + name

/**
 * Session memory for every project. Per-session maps are keyed by [memoryKey]; the
 * ticks are one-shot signals an open screen watches (a save or a delete landed).
 */
data class MemoryState(
    /** The last folder listing per project; `exists` false is the empty state. */
    val lists: Map<String, MemoryList> = emptyMap(),
    val listLoading: Set<String> = emptySet(),
    val listError: Map<String, String> = emptyMap(),
    /** Full documents; a list's own `content` is only a preview. */
    val documents: Map<String, MemorySession> = emptyMap(),
    /** Bumped whenever a document arrives, so an open editor reseeds its draft. */
    val documentRevision: Map<String, Int> = emptyMap(),
    val documentLoading: Set<String> = emptySet(),
    val documentError: Map<String, String> = emptyMap(),
    val saving: Set<String> = emptySet(),
    val saveError: Map<String, String> = emptyMap(),
    val savedTick: Map<String, Int> = emptyMap(),
    val deleting: Set<String> = emptySet(),
    val deleteError: Map<String, String> = emptyMap(),
    val deletedTick: Map<String, Int> = emptyMap(),
    /** The Mac refused a save because the file moved; the newer text is already loaded. */
    val conflictNotice: Map<String, String> = emptyMap(),
    /** project → the session name a create just produced, for the list to open. */
    val createdName: Map<String, String> = emptyMap(),
    val feedback: HapticCue? = null
) {
    fun sessions(project: String): List<MemorySession> = lists[project]?.sessions.orEmpty()

    fun document(project: String, name: String): MemorySession? =
        documents[memoryKey(project, name)]

    /**
     * The folder these sessions live in — a duplicate resolves to its original, so
     * this is not always the project name. Empty until the first load lands.
     */
    fun owner(project: String): String = lists[project]?.owner.orEmpty()

    /** True when this project reads and writes another project's sessions. */
    fun isShared(project: String): Boolean {
        val owner = owner(project)
        return owner.isNotEmpty() && owner != project
    }

    /** False when the folder doesn't exist yet (the empty state) or nothing has loaded. */
    fun folderExists(project: String): Boolean = lists[project]?.exists ?: false
}

/** A tick's next value. */
internal fun Map<String, Int>.bump(key: String): Int = (this[key] ?: 0) + 1

package cx.lpm.mobile.feature.memory.session

import androidx.compose.runtime.Immutable
import cx.lpm.mobile.core.model.HapticCue
import cx.lpm.mobile.feature.memory.data.MemoryState
import cx.lpm.mobile.feature.memory.data.memoryKey
import cx.lpm.mobile.feature.memory.format.memoryLastAgent
import cx.lpm.mobile.feature.memory.format.relativeMemoryTime
import java.time.Instant

@Immutable
data class MemorySessionUiState(
    val name: String,
    /** The document's own title once it lands, the list's until then. */
    val title: String,
    /** The full markdown, or null until the first fetch answers. */
    val content: String? = null,
    /** When it was last written ("2 hours ago"). */
    val updated: String = "",
    /** The agent named by the newest timeline entry, or "". */
    val agent: String = "",
    val loading: Boolean = false,
    val error: String? = null,
    val deleting: Boolean = false,
    val conflictNotice: String? = null,
    val deleteError: String? = null,
    /** The session was deleted while this page showed: it closes. */
    val deleted: Boolean = false,
    val feedback: HapticCue? = null
) {
    val canEdit: Boolean get() = content != null && !deleting
}

internal fun MemoryState.sessionState(
    project: String,
    name: String,
    fallbackTitle: String,
    deletedTickAtOpen: Int?,
    now: Instant
): MemorySessionUiState {
    val k = memoryKey(project, name)
    val doc = documents[k]
    return MemorySessionUiState(
        name = name,
        title = doc?.title ?: fallbackTitle,
        content = doc?.content,
        updated = doc?.let { relativeMemoryTime(it.updatedAt, now) }.orEmpty(),
        agent = doc?.let { memoryLastAgent(it.content) }.orEmpty(),
        loading = k in documentLoading,
        error = documentError[k],
        deleting = k in deleting,
        conflictNotice = conflictNotice[k],
        deleteError = deleteError[k],
        deleted = deletedTick[k] != deletedTickAtOpen,
        feedback = feedback
    )
}

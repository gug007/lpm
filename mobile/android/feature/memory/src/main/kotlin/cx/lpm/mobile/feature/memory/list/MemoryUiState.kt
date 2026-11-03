package cx.lpm.mobile.feature.memory.list

import androidx.compose.runtime.Immutable
import cx.lpm.mobile.core.data.projects.ProjectsState
import cx.lpm.mobile.core.model.HapticCue
import cx.lpm.mobile.core.model.MemorySession
import cx.lpm.mobile.feature.memory.data.MemoryState
import cx.lpm.mobile.feature.memory.data.memoryKey
import cx.lpm.mobile.feature.memory.format.memoryGoalLine
import cx.lpm.mobile.feature.memory.format.memoryLastAgent
import cx.lpm.mobile.feature.memory.format.relativeMemoryTime
import java.time.Instant

/** One session in the list: its title, what it's about, and who touched it when. */
@Immutable
data class MemoryRowUi(
    val name: String,
    val title: String,
    /** The goal's first line, or the name agents resume it by when that differs. */
    val subtitle: String,
    /** "claude · 2 hours ago": the last agent to remember, and when. */
    val stamp: String
)

@Immutable
data class MemoryUiState(
    val project: String = "",
    /** The project these sessions belong to, by display name (the original for a copy). */
    val ownerLabel: String = "",
    val shared: Boolean = false,
    val rows: List<MemoryRowUi> = emptyList(),
    /** Nothing listed yet and no failure: the spinner, not the empty state. */
    val loading: Boolean = true,
    val error: String? = null,
    val deleteError: String? = null,
    val feedback: HapticCue? = null
) {
    fun titleOf(name: String): String = rows.firstOrNull { it.name == name }?.title ?: name
}

internal fun MemoryState.listState(
    project: String,
    projects: ProjectsState?,
    deleting: String?,
    now: Instant
): MemoryUiState {
    val list = lists[project]
    val error = listError[project]
    return MemoryUiState(
        project = project,
        ownerLabel = ownerLabel(project, projects),
        shared = isShared(project),
        rows = sessions(project).map { it.row(now) },
        loading = list == null && error == null,
        error = error,
        deleteError = deleting?.let { deleteError[memoryKey(project, it)] },
        feedback = feedback
    )
}

/** This project's label, or its original's when it reads a copy's sessions. */
internal fun MemoryState.ownerLabel(project: String, projects: ProjectsState?): String {
    val owner = owner(project)
    if (owner.isEmpty() || owner == project) return projects?.project(project)?.label ?: project
    return projects?.project(owner)?.label ?: owner
}

private fun MemorySession.row(now: Instant): MemoryRowUi {
    val goal = memoryGoalLine(content)
    val agent = memoryLastAgent(content)
    val time = relativeMemoryTime(updatedAt, now)
    return MemoryRowUi(
        name = name,
        title = title,
        subtitle = goal.ifEmpty { if (name == title) "" else name },
        stamp = if (agent.isEmpty()) time else "$agent · $time"
    )
}

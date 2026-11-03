package cx.lpm.mobile.core.data.git

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** [GitState.notice]: each project's current confirmation, let go once its time is up. */
internal class GitNotices(
    private val scope: CoroutineScope,
    private val state: MutableStateFlow<GitState>
) {
    private val expiry = mutableMapOf<String, Job>()

    fun show(project: String, notice: GitNotice, millis: Long = NOTICE_MS) {
        state.update { it.copy(notice = it.notice + (project to notice)) }
        expiry.remove(project)?.cancel()
        expiry[project] = scope.launch {
            delay(millis)
            expiry.remove(project)
            state.update { it.copy(notice = it.notice - project) }
        }
    }

    fun dismiss(project: String) {
        expiry.remove(project)?.cancel()
        state.update { it.copy(notice = it.notice - project) }
    }

    fun reset() {
        expiry.values.forEach { it.cancel() }
        expiry.clear()
    }

    companion object {
        const val NOTICE_MS = 2_000L

        /** A notice with Undo stays as long as the desktop's undo toast. */
        const val UNDO_NOTICE_MS = 10_000L
    }
}

package cx.lpm.mobile.core.data.git

import cx.lpm.mobile.core.data.client.requestBranchDiffs
import cx.lpm.mobile.core.data.client.requestGitDiffs
import cx.lpm.mobile.core.data.session.GenerationTimeout
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.model.GitDiffResult
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The review screen's per-file diffs (iOS `GitReviewStore`'s diff half). Each file
 * keeps its own loading state, error and timeout, but the requests are coalesced:
 * the lazy loads of a burst go out as one `gitDiffs` batch per project. The file
 * stamp each diff was fetched at lets a live refresh re-fetch only the files that
 * actually changed.
 */
internal class GitDiffs(
    private val session: MacSession,
    private val state: MutableStateFlow<GitState>,
    private val timeout: GenerationTimeout<String>
) {
    private val stamps = mutableMapOf<GitDiffKey, String>()
    private val pending = mutableMapOf<String, MutableSet<String>>()
    private val flushes = mutableMapOf<String, Job>()

    fun reset() {
        stamps.clear()
        pending.clear()
        flushes.values.forEach { it.cancel() }
        flushes.clear()
    }

    fun load(project: String, path: String) {
        val key = GitDiffKey(project, path)
        if (key in state.value.diffLoading) return
        state.update { it.copy(diffLoading = it.diffLoading + key, diffError = it.diffError - key) }
        enqueue(project, path)
        timeout.arm(timeoutKey(key), LOAD_TIMEOUT_MS) {
            if (key !in state.value.diffLoading) return@arm
            state.update { s ->
                s.copy(
                    diffLoading = s.diffLoading - key,
                    diffError = if (s.diffs[key] == null) {
                        s.diffError + (key to "Couldn't load the diff. Try again.")
                    } else {
                        s.diffError
                    }
                )
            }
        }
    }

    /** One file's reply, from a `gitDiff` or a `gitDiffs` batch entry. */
    fun apply(project: String, path: String, result: GitDiffResult?, error: String?) {
        val key = GitDiffKey(project, path)
        timeout.cancel(timeoutKey(key))
        if (result == null) {
            state.update {
                it.copy(
                    diffLoading = it.diffLoading - key,
                    diffError = it.diffError + (key to (error ?: "Couldn't load the diff."))
                )
            }
            return
        }
        stamps[key] = state.value.snapshots[project]?.files?.firstOrNull { it.path == path }
            ?.stamp.orEmpty()
        state.update {
            it.copy(
                diffLoading = it.diffLoading - key,
                diffs = it.diffs + (key to result),
                diffError = it.diffError - key
            )
        }
    }

    /**
     * Fetch every changed file's diff as soon as the snapshot lands, so rows arrive at
     * their full height instead of growing under the finger mid-scroll.
     */
    fun prefetch(project: String) {
        val files = state.value.snapshots[project]?.files ?: return
        for (file in files) {
            val key = GitDiffKey(project, file.path)
            val s = state.value
            if (s.diffs[key] == null && key !in s.diffLoading) load(project, file.path)
        }
    }

    /**
     * After a live refresh's snapshot: re-fetch loaded diffs whose stamp changed (or
     * is unknown on either side), and drop those of files that left the snapshot.
     */
    fun reconcile(project: String) {
        val files = state.value.snapshots[project]?.files ?: return
        val stampByPath = files.distinctBy { it.path }.associate { it.path to it.stamp }
        val gone = mutableSetOf<GitDiffKey>()
        for (key in state.value.diffs.keys.filter { it.project == project }) {
            val stamp = stampByPath[key.path]
            if (stamp == null) {
                gone += key
                continue
            }
            val remembered = stamps[key].orEmpty()
            if (stamp.isEmpty() || remembered.isEmpty() || stamp != remembered) {
                load(project, key.path)
            }
        }
        if (gone.isEmpty()) return
        stamps -= gone
        state.update {
            it.copy(
                diffs = it.diffs - gone,
                diffError = it.diffError - gone,
                diffLoading = it.diffLoading - gone
            )
        }
    }

    /** A Branch scope that changed: its files still there load again, the rest go. */
    fun refresh(key: String, files: Set<String>) {
        val loaded = state.value.diffs.keys.filter { it.project == key }
        val gone = loaded.filter { it.path !in files }.toSet()
        if (gone.isNotEmpty()) {
            stamps -= gone
            state.update { it.copy(diffs = it.diffs - gone, diffError = it.diffError - gone) }
        }
        loaded.filter { it.path in files }.forEach { load(key, it.path) }
    }

    private fun enqueue(project: String, path: String) {
        pending.getOrPut(project) { linkedSetOf() } += path
        flushes.remove(project)?.cancel()
        flushes[project] = session.scope.launch {
            delay(FLUSH_MS)
            flushes.remove(project)
            val paths = pending.remove(project)
            if (paths.isNullOrEmpty()) return@launch
            val branchOf = GitExtrasStore.branchProject(project)
            if (branchOf != null) {
                session.client?.requestBranchDiffs(branchOf, paths.toList())
            } else {
                session.client?.requestGitDiffs(project, paths.toList())
            }
        }
    }

    private fun timeoutKey(key: GitDiffKey) = "diff\n" + key.path + "\u0000" + key.project

    private companion object {
        const val LOAD_TIMEOUT_MS = 30_000L
        const val FLUSH_MS = 50L
    }
}

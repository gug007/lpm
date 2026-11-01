package cx.lpm.mobile.core.data.git

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.requestGitCommitFiles
import cx.lpm.mobile.core.data.client.requestGitCommitPatch
import cx.lpm.mobile.core.data.client.requestGitHistory
import cx.lpm.mobile.core.data.session.GenerationTimeout
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.CommitFile
import cx.lpm.mobile.core.model.GitDiffResult
import cx.lpm.mobile.core.model.HistoryCommit
import cx.lpm.mobile.core.model.HistoryPage
import cx.lpm.mobile.core.model.Project
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withTimeoutOrNull

/** A project's commits as far as they're loaded. */
data class HistoryLog(
    val commits: List<HistoryCommit> = emptyList(),
    val hasMore: Boolean = false,
    val loading: Boolean = false,
    val loaded: Boolean = false,
    val error: String? = null,
    /** Where the page in flight starts: 0 replaces the list, more appends. */
    val asking: Int = 0
)

/** A commit's files; null `files` with no `error` is still loading. */
data class HistoryFiles(val files: List<CommitFile>? = null, val error: String? = null)

/** One file's patch in a commit; neither set is still loading. */
data class HistoryPatch(val result: GitDiffResult? = null, val error: String? = null)

data class CommitKey(val project: String, val hash: String)

data class PatchKey(val project: String, val hash: String, val path: String)

data class GitHistoryState(
    val logs: Map<String, HistoryLog> = emptyMap(),
    val files: Map<CommitKey, HistoryFiles> = emptyMap(),
    val patches: Map<PatchKey, HistoryPatch> = emptyMap()
) {
    fun log(project: String): HistoryLog = logs[project] ?: HistoryLog()

    fun files(project: String, hash: String): HistoryFiles =
        files[CommitKey(project, hash)] ?: HistoryFiles()

    fun patch(project: String, hash: String, path: String): HistoryPatch =
        patches[PatchKey(project, hash, path)] ?: HistoryPatch()
}

/**
 * The History screens' state (iOS `GitHistoryStore`): each project's commits a page
 * at a time, each opened commit's files, and each opened file's patch.
 */
class GitHistoryStore(private val session: MacSession) : SessionStore {
    private val mutable = MutableStateFlow(GitHistoryState())
    val state: StateFlow<GitHistoryState> = mutable.asStateFlow()

    private val client: LpmClient? get() = session.client
    private val timeout = GenerationTimeout<String>(session.scope)
    private val asked = mutableMapOf<PatchKey, CommitFile>()

    override fun wire(client: LpmClient) {
        client.onGitHistory = ::applyHistory
        client.onGitCommitFiles = ::applyFiles
        client.onGitCommitPatch = ::applyPatch
    }

    override fun reset() {
        timeout.cancelAll()
        asked.clear()
        mutable.value = GitHistoryState()
    }

    /** The link came back: ask again for whatever was still on its way. */
    override fun onConnectionReset() {
        val s = state.value
        s.logs.forEach { (project, log) -> if (log.loading) request(project, log.asking) }
        s.files.forEach { (key, entry) ->
            if (entry.files == null && entry.error == null) loadFiles(key.project, key.hash)
        }
        asked.toMap().forEach { (key, file) -> loadPatch(key.project, key.hash, file) }
    }

    /** The Mac answers History, and the project is in a folder it can read. */
    fun canShowHistory(project: Project): Boolean =
        client?.hostFeatures?.contains(LpmClient.GIT_HISTORY_FEATURE) == true && !project.isRemote

    /** The newest page again; what's listed stays until it lands. */
    fun load(project: String) = request(project, skip = 0)

    fun loadMore(project: String) {
        val log = state.value.log(project)
        if (!log.hasMore || log.loading) return
        request(project, skip = log.commits.size)
    }

    /** Pull to refresh: ask again and hold the spinner until the answer lands. */
    suspend fun refresh(project: String) {
        load(project)
        withTimeoutOrNull(REFRESH_WAIT_MS) { state.first { !it.log(project).loading } }
    }

    private fun request(project: String, skip: Int) {
        updateLog(project) { it.copy(loading = true, asking = skip) }
        client?.requestGitHistory(project, skip, PAGE_SIZE)
        timeout.arm("log\n$project", TIMEOUT_MS) {
            updateLog(project) {
                if (it.loading) it.copy(loading = false, error = LATE_ANSWER) else it
            }
        }
    }

    private fun applyHistory(project: String, skip: Int, page: HistoryPage?, error: String?) {
        timeout.cancel("log\n$project")
        updateLog(project) { log ->
            val done = log.copy(loading = false, loaded = true)
            if (page == null) {
                done.copy(error = error)
            } else {
                val commits =
                    if (skip == 0) page.commits else log.commits.take(skip) + page.commits
                done.copy(commits = commits, hasMore = page.hasMore, error = null)
            }
        }
    }

    private fun updateLog(project: String, change: (HistoryLog) -> HistoryLog) =
        mutable.update { it.copy(logs = it.logs + (project to change(it.log(project)))) }

    // One commit

    fun loadFiles(project: String, hash: String) {
        val key = CommitKey(project, hash)
        setFiles(key, HistoryFiles())
        client?.requestGitCommitFiles(project, hash)
        timeout.arm("files\n$project\n$hash", TIMEOUT_MS) {
            if (state.value.files[key]?.files ==
                null
            ) {
                setFiles(key, HistoryFiles(error = LATE_ANSWER))
            }
        }
    }

    private fun applyFiles(
        project: String,
        hash: String,
        files: List<CommitFile>?,
        error: String?
    ) {
        timeout.cancel("files\n$project\n$hash")
        setFiles(CommitKey(project, hash), HistoryFiles(files, if (files == null) error else null))
    }

    private fun setFiles(key: CommitKey, entry: HistoryFiles) =
        mutable.update { it.copy(files = it.files + (key to entry)) }

    // One file's patch

    fun loadPatch(project: String, hash: String, file: CommitFile) {
        val key = PatchKey(project, hash, file.path)
        setPatch(key, HistoryPatch())
        asked[key] = file
        client?.requestGitCommitPatch(project, hash, file.path, file.oldPath)
        timeout.arm(patchTimeoutKey(key), TIMEOUT_MS) {
            val patch = state.value.patches[key]
            if (patch != null && patch.result == null && patch.error == null) {
                setPatch(key, HistoryPatch(error = LATE_ANSWER))
            }
        }
    }

    private fun applyPatch(
        project: String,
        hash: String,
        path: String,
        result: GitDiffResult?,
        error: String?
    ) {
        val key = PatchKey(project, hash, path)
        timeout.cancel(patchTimeoutKey(key))
        asked.remove(key)
        setPatch(key, if (result != null) HistoryPatch(result) else HistoryPatch(error = error))
    }

    private fun setPatch(key: PatchKey, patch: HistoryPatch) =
        mutable.update { it.copy(patches = it.patches + (key to patch)) }

    private fun patchTimeoutKey(key: PatchKey) =
        listOf("patch", key.project, key.hash, key.path).joinToString("\n")

    companion object {
        /** The desktop's page size. */
        const val PAGE_SIZE = 100
        private const val TIMEOUT_MS = 30_000L
        private const val REFRESH_WAIT_MS = 10_000L
        private const val LATE_ANSWER = "The Mac didn't answer in time."
    }
}

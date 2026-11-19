package cx.lpm.mobile.core.data.git

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.requestBranchFiles
import cx.lpm.mobile.core.data.client.requestCheckLog
import cx.lpm.mobile.core.data.client.requestPrDiscussion
import cx.lpm.mobile.core.data.client.scanSecrets
import cx.lpm.mobile.core.data.client.writeFile
import cx.lpm.mobile.core.data.session.GenerationTimeout
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.BranchScope
import cx.lpm.mobile.core.model.CheckLog
import cx.lpm.mobile.core.model.FileWriteResult
import cx.lpm.mobile.core.model.PrDiscussion
import cx.lpm.mobile.core.model.SecretFinding
import cx.lpm.mobile.core.protocol.BranchDiffsReply
import cx.lpm.mobile.core.protocol.BranchFilesReply
import cx.lpm.mobile.core.protocol.CheckLogReply
import cx.lpm.mobile.core.protocol.FileWriteReply
import cx.lpm.mobile.core.protocol.Inbound
import cx.lpm.mobile.core.protocol.PrDiscussionReply
import cx.lpm.mobile.core.protocol.SecretScanReply
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/** A commit the look for secrets holds until the Mac answers. */
data class PendingCommit(val message: String, val files: List<String>, val push: Boolean)

data class GitExtrasState(
    val scanning: Set<String> = emptySet(),
    val findings: Map<String, List<SecretFinding>> = emptyMap(),
    val pendingCommits: Map<String, PendingCommit> = emptyMap(),
    val branchScopes: Map<String, BranchScope> = emptyMap(),
    /** Loaded with nothing to compare with when here without a scope. */
    val branchLoaded: Set<String> = emptySet(),
    val branchLoading: Set<String> = emptySet(),
    val branchErrors: Map<String, String> = emptyMap(),
    val discussions: Map<String, PrDiscussion> = emptyMap(),
    /** Failed checks' logs and errors, by project and then by the check's URL. */
    val checkLogs: Map<String, Map<String, CheckLog>> = emptyMap(),
    val checkLogLoading: Set<String> = emptySet(),
    val checkLogErrors: Map<String, Map<String, String>> = emptyMap()
) {
    /** The files the findings are in, which "Leave Out and Commit" takes out. */
    fun flaggedFiles(project: String): List<String> =
        findings[project].orEmpty().map { it.path }.distinct()

    /** Files the waiting commit keeps once the flagged ones are left out. */
    fun cleanFiles(project: String): List<String> {
        val flagged = flaggedFiles(project).toSet()
        return pendingCommits[project]?.files.orEmpty().filter { it !in flagged }
    }

    fun pendingPushes(project: String): Boolean = pendingCommits[project]?.push == true
}

/**
 * The review's extras (iOS `GitExtrasStore`): the look for secrets before a
 * commit, the branch's own changes, the review on its pull request, why a check
 * failed, and saving an edit from the file preview. Each asks the Mac only when
 * its `features` says it answers. A Mac that can't scan, or a scan that fails,
 * never stops a commit.
 */
class GitExtrasStore(private val session: MacSession) : SessionStore {
    private val mutable = MutableStateFlow(GitExtrasState())
    val state: StateFlow<GitExtrasState> = mutable.asStateFlow()

    private val timeout = GenerationTimeout<String>(session.scope)
    private val ignored = mutableMapOf<String, MutableSet<String>>()
    private val discussionAsked = mutableMapOf<String, Long>()
    private val saves = mutableMapOf<String, (FileWriteResult) -> Unit>()

    private val client: LpmClient? get() = session.client
    private val git: GitStore get() = session.store()

    private fun has(feature: String) = client?.hostFeatures?.contains(feature) == true

    val canScanSecrets: Boolean get() = has(LpmClient.GIT_SCAN_SECRETS_FEATURE)
    val canBranchScope: Boolean get() = has(LpmClient.GIT_BRANCH_DIFF_FEATURE)
    val canReadDiscussion: Boolean get() = has(LpmClient.GIT_PR_DISCUSSION_FEATURE)
    val canReadCheckLogs: Boolean get() = has(LpmClient.GIT_CHECK_LOG_FEATURE)
    val canWriteFiles: Boolean get() = has(LpmClient.WRITE_FILE_FEATURE)

    override fun wire(client: LpmClient) {
        client.onGitExtras = ::route
    }

    override fun reset() {
        timeout.cancelAll()
        ignored.clear()
        discussionAsked.clear()
        failSaves()
        mutable.value = GitExtrasState()
    }

    override fun onConnectionReset() {
        timeout.cancelAll()
        failSaves()
        mutable.update {
            it.copy(
                scanning = emptySet(),
                pendingCommits = emptyMap(),
                branchLoading = emptySet(),
                checkLogLoading = emptySet()
            )
        }
    }

    private fun route(frame: Inbound) {
        when (frame) {
            is SecretScanReply -> applyScan(frame)

            is BranchFilesReply -> applyBranchFiles(frame)

            is BranchDiffsReply -> frame.entries.forEach {
                git.applyDiff(branchKey(frame.project), it.path, it.result, it.error)
            }

            is PrDiscussionReply -> if (frame.error == null) {
                mutable.update { s ->
                    s.copy(
                        discussions = frame.discussion
                            ?.let { s.discussions + (frame.project to it) }
                            ?: (s.discussions - frame.project)
                    )
                }
            }

            is CheckLogReply -> applyCheckLog(frame)

            is FileWriteReply -> {
                timeout.cancel("save\u0000" + frame.result.reqId)
                saves.remove(frame.result.reqId)?.invoke(frame.result)
            }

            else -> Unit
        }
    }

    // MARK: secrets

    fun commit(project: String, message: String, files: List<String>, push: Boolean) {
        val pending = PendingCommit(message, files, push)
        if (!canScanSecrets) return run(project, pending)
        mutable.update {
            it.copy(
                findings = it.findings - project,
                pendingCommits = it.pendingCommits + (project to pending),
                scanning = it.scanning + project
            )
        }
        client?.scanSecrets(project, files)
        timeout.arm("scan\u0000$project", SCAN_TIMEOUT_MS) {
            if (project in state.value.scanning) take(project)?.let { run(project, it) }
        }
    }

    private fun applyScan(reply: SecretScanReply) {
        val project = reply.project
        timeout.cancel("scan\u0000$project")
        val pending = state.value.pendingCommits[project]
        if (project !in state.value.scanning || pending == null) return
        val skip = ignored[project].orEmpty()
        val open = reply.findings.filter { it.path in pending.files && it.id !in skip }
        if (open.isEmpty()) {
            take(project)
            run(project, pending)
        } else {
            mutable.update {
                it.copy(
                    scanning = it.scanning - project,
                    findings = it.findings + (project to open)
                )
            }
        }
    }

    fun ignore(project: String, finding: SecretFinding) {
        ignored.getOrPut(project) { mutableSetOf() } += finding.id
        dropFindings(project) { it.id == finding.id }
    }

    /** One file out of the commit; the sheet drops it from the selection too. */
    fun leaveOut(project: String, path: String) = dropFindings(project) { it.path == path }

    /** The flagged files out, the rest committed as asked. */
    fun leaveOutAndCommit(project: String) {
        val files = state.value.cleanFiles(project)
        val pending = take(project)
        if (pending != null && files.isNotEmpty()) run(project, pending.copy(files = files))
    }

    fun commitAnyway(project: String) {
        take(project)?.let { run(project, it) }
    }

    fun dismissFindings(project: String) {
        take(project)
    }

    /** The commit sheet closed: what was waved through is forgotten with it. */
    fun forgetSecrets(project: String) {
        dismissFindings(project)
        ignored.remove(project)
    }

    private fun dropFindings(project: String, drop: (SecretFinding) -> Boolean) {
        mutable.update {
            it.copy(
                findings =
                    it.findings + (project to it.findings[project].orEmpty().filterNot(drop))
            )
        }
        if (state.value.findings[project]?.isEmpty() == true) dismissFindings(project)
    }

    /** Ends the project's look for secrets, handing back the commit it held. */
    private fun take(project: String): PendingCommit? {
        val pending = state.value.pendingCommits[project]
        mutable.update {
            it.copy(
                scanning = it.scanning - project,
                findings = it.findings - project,
                pendingCommits = it.pendingCommits - project
            )
        }
        return pending
    }

    private fun run(project: String, pending: PendingCommit) {
        if (pending.push) {
            git.commitAndPush(project, pending.message, pending.files)
        } else {
            git.commit(project, pending.message, pending.files)
        }
    }

    // MARK: branch scope

    fun loadBranch(project: String) {
        if (!canBranchScope || project in state.value.branchLoading) return
        mutable.update {
            it.copy(
                branchLoading = it.branchLoading + project,
                branchErrors = it.branchErrors - project
            )
        }
        client?.requestBranchFiles(project)
        timeout.arm("branch\u0000$project", LOAD_TIMEOUT_MS) {
            if (project !in state.value.branchLoading) return@arm
            mutable.update { s ->
                s.copy(
                    branchLoading = s.branchLoading - project,
                    branchErrors = if (project in s.branchLoaded) {
                        s.branchErrors
                    } else {
                        s.branchErrors + (project to "Couldn't reach your Mac. Pull to refresh.")
                    }
                )
            }
        }
    }

    private fun applyBranchFiles(reply: BranchFilesReply) {
        val project = reply.project
        timeout.cancel("branch\u0000$project")
        val error = reply.error
        if (error != null) {
            mutable.update {
                it.copy(
                    branchLoading = it.branchLoading - project,
                    branchErrors = it.branchErrors + (project to error)
                )
            }
            return
        }
        val before = state.value.branchScopes[project]
        mutable.update { s ->
            s.copy(
                branchLoading = s.branchLoading - project,
                branchLoaded = s.branchLoaded + project,
                branchScopes = reply.scope
                    ?.let { s.branchScopes + (project to it) }
                    ?: (s.branchScopes - project)
            )
        }
        if (before == reply.scope) return
        val key = branchKey(project)
        val files = reply.scope?.files.orEmpty().map { it.path }.toSet()
        git.refreshDiffs(key, files)
    }

    // MARK: review and logs

    /** Asks again at most once a minute unless [fresh], as the CI row does. */
    fun loadDiscussion(project: String, fresh: Boolean = false) {
        if (!canReadDiscussion) return
        val now = session.env.clock.millis()
        val last = discussionAsked[project]
        if (!fresh && last != null && now - last < DISCUSSION_EVERY_MS) return
        discussionAsked[project] = now
        client?.requestPrDiscussion(project)
    }

    fun loadCheckLog(project: String, url: String) {
        val key = "$project\n$url"
        if (!canReadCheckLogs || key in state.value.checkLogLoading) return
        mutable.update {
            it.copy(
                checkLogLoading = it.checkLogLoading + key,
                checkLogErrors = it.checkLogErrors.with(project, url, null)
            )
        }
        client?.requestCheckLog(project, url)
        timeout.arm("log\u0000$key", LOG_TIMEOUT_MS) {
            if (key !in state.value.checkLogLoading) return@arm
            mutable.update {
                it.copy(
                    checkLogLoading = it.checkLogLoading - key,
                    checkLogErrors = it.checkLogErrors.with(project, url, LOG_TIMED_OUT)
                )
            }
        }
    }

    private fun applyCheckLog(reply: CheckLogReply) {
        val key = "${reply.project}\n${reply.url}"
        timeout.cancel("log\u0000$key")
        mutable.update { s ->
            val log = reply.log
            s.copy(
                checkLogLoading = s.checkLogLoading - key,
                checkLogs = if (log !=
                    null
                ) {
                    s.checkLogs.with(reply.project, reply.url, log)
                } else {
                    s.checkLogs
                },
                checkLogErrors = if (log == null) {
                    s.checkLogErrors.with(
                        reply.project,
                        reply.url,
                        reply.error ?: "Couldn't read the log."
                    )
                } else {
                    s.checkLogErrors
                }
            )
        }
    }

    /** The CI sheet asked again: a re-run's logs are new. */
    fun forgetCheckLogs(project: String) = mutable.update {
        it.copy(checkLogs = it.checkLogs - project, checkLogErrors = it.checkLogErrors - project)
    }

    private fun <T> Map<String, Map<String, T>>.with(
        project: String,
        url: String,
        value: T?
    ): Map<String, Map<String, T>> {
        val urls = get(project).orEmpty()
        return this + (project to if (value == null) urls - url else urls + (url to value))
    }

    // MARK: saving

    fun save(
        project: String,
        path: String,
        content: String,
        base: String,
        done: (FileWriteResult) -> Unit
    ) {
        val reqId = UUID.randomUUID().toString()
        saves[reqId] = done
        client?.writeFile(project, path, content, base, reqId)
        timeout.arm("save\u0000$reqId", SAVE_TIMEOUT_MS) {
            saves.remove(reqId)?.invoke(
                FileWriteResult(reqId, null, false, SAVE_TIMED_OUT)
            )
        }
    }

    private fun failSaves() {
        val waiting = saves.toMap()
        saves.clear()
        waiting.forEach { (reqId, done) ->
            done(FileWriteResult(reqId, null, false, SAVE_LOST))
        }
    }

    companion object {
        private const val BRANCH_SUFFIX = "\u0001branch"
        private const val SCAN_TIMEOUT_MS = 45_000L
        private const val LOAD_TIMEOUT_MS = 30_000L
        private const val LOG_TIMEOUT_MS = 45_000L
        private const val SAVE_TIMEOUT_MS = 30_000L
        private const val DISCUSSION_EVERY_MS = 55_000L
        private const val LOG_TIMED_OUT = "Couldn't read the log. Try again."
        private const val SAVE_TIMED_OUT = "Saving timed out. Check your Mac and try again."
        private const val SAVE_LOST = "Lost the connection to your Mac before it saved."

        /** Where a project's Branch scope keeps its diffs and Viewed marks. */
        fun branchKey(project: String) = project + BRANCH_SUFFIX

        /** The project a branch key stands for; null for a project's own key. */
        fun branchProject(key: String): String? =
            if (key.endsWith(BRANCH_SUFFIX)) key.dropLast(BRANCH_SUFFIX.length) else null
    }
}

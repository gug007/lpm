package cx.lpm.mobile.core.data.automations

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.answerJobQuestion
import cx.lpm.mobile.core.data.client.deleteJob
import cx.lpm.mobile.core.data.client.dismissJobQuestion
import cx.lpm.mobile.core.data.client.markAllJobsSeen
import cx.lpm.mobile.core.data.client.markJobSeen
import cx.lpm.mobile.core.data.client.requestJobConfig
import cx.lpm.mobile.core.data.client.requestJobHistory
import cx.lpm.mobile.core.data.client.requestJobLiveOutput
import cx.lpm.mobile.core.data.client.requestJobs
import cx.lpm.mobile.core.data.client.runJob
import cx.lpm.mobile.core.data.client.saveJob
import cx.lpm.mobile.core.data.client.sendJobFollowup
import cx.lpm.mobile.core.data.client.setJobEnabled
import cx.lpm.mobile.core.data.client.stopJob
import cx.lpm.mobile.core.data.client.takeOverJob
import cx.lpm.mobile.core.data.session.GenerationTimeout
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.AutomationJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.serialization.json.JsonObject

/**
 * The Mac's scheduled automations (iOS `AppModel`'s automations area): the list,
 * each job's run history and live output, run/stop/enable, read state, follow-ups,
 * and the editor's config read and writes. The list arrives with every `ready` and
 * again whenever the Mac says it changed.
 */
class AutomationsStore(private val session: MacSession) : SessionStore {
    private val mutable = MutableStateFlow(AutomationsState())
    val state: StateFlow<AutomationsState> = mutable.asStateFlow()

    private val timeout = GenerationTimeout<String>(session.scope)
    private val client: LpmClient? get() = session.client

    override fun wire(client: LpmClient) {
        val c = client
        c.onJobs = { jobs, machines, error ->
            mutable.update {
                if (error != null) {
                    it.copy(loaded = true, error = error)
                } else {
                    it.copy(jobs = jobs, machines = machines, loaded = true)
                }
            }
        }
        c.onJobHistory = { project, jobId, entries, error ->
            val key = automationKey(project, jobId)
            mutable.update {
                val loading = it.historyLoading - key
                if (error == null) {
                    it.copy(historyLoading = loading, history = it.history + (key to entries))
                } else {
                    it.copy(historyLoading = loading, error = error)
                }
            }
        }
        c.onJobLiveOutput = { project, jobId, live, error ->
            val key = automationKey(project, jobId)
            mutable.update {
                val output = live?.let { l -> it.liveOutput + (key to l) } ?: (it.liveOutput - key)
                it.copy(liveOutput = output, error = error ?: it.error)
            }
        }
        c.onAutomationMutation = { project, jobId, error ->
            val key = automationKey(project, jobId)
            mutable.update { it.copy(pending = it.pending - key, error = error ?: it.error) }
            c.requestJobs()
            if (key in state.value.history) c.requestJobHistory(project, jobId)
        }
        c.onAutomationFollowup = { project, jobId, error ->
            val key = automationKey(project, jobId)
            mutable.update {
                val errors = error?.let { e -> it.followupError + (key to e) } ?: it.followupError
                it.copy(pending = it.pending - key, followupError = errors)
            }
            c.requestJobs()
            c.requestJobHistory(project, jobId)
            c.requestJobLiveOutput(project, jobId)
        }
        // The Mac's jobs-changed that follows refreshes the list and histories.
        c.onAutomationAnswer = { project, jobId, error ->
            val key = automationKey(project, jobId)
            mutable.update {
                val errors = error?.let { e -> it.askError + (key to e) } ?: (it.askError - key)
                it.copy(pending = it.pending - key, askError = errors)
            }
        }
        c.onJobConfig = { _, _, job, error ->
            mutable.update {
                if (error != null) {
                    it.copy(jobConfigLoadingKey = null, jobConfigError = error)
                } else {
                    it.copy(jobConfigLoadingKey = null, jobConfigBody = job)
                }
            }
        }
        c.onJobSaved = { _, error -> finishMutation(error, c) }
        c.onJobDeleted = { _, error -> finishMutation(error, c) }
        c.onJobsChanged = {
            c.requestJobs()
            for (key in state.value.history.keys) {
                // A standalone job's project is the empty sentinel, so the split keeps
                // the empty leading part.
                val parts = key.split("\n", limit = 2)
                if (parts.size == 2) c.requestJobHistory(parts[0], parts[1])
            }
        }
    }

    override fun reset() {
        timeout.cancelAll()
        mutable.value = AutomationsState()
    }

    override fun onConnectionReset() {
        mutable.update { it.copy(pending = emptySet(), historyLoading = emptySet()) }
    }

    fun load() {
        client?.requestJobs()
    }

    /** Pull to refresh: the list again, or a reconnect when the link is down. */
    suspend fun refresh() {
        val c = client
        if (session.state.value.isReady && c != null) {
            c.requestJobs()
        } else {
            session.reconnectIfNeeded()
        }
        delay(REFRESH_SETTLE_MS)
    }

    fun loadHistory(project: String, jobId: String) {
        val key = automationKey(project, jobId)
        mutable.update { it.copy(historyLoading = it.historyLoading + key) }
        client?.requestJobHistory(project, jobId)
    }

    fun loadLiveOutput(project: String, jobId: String) {
        client?.requestJobLiveOutput(project, jobId)
    }

    /**
     * Run, stop and pause reach every folder the job runs in: a shared job is one row
     * on screen but keeps its state — and its runs — per project.
     */
    fun run(job: AutomationJob) = forEachTarget(job) { c, target -> c.runJob(target, job.id) }

    fun stop(job: AutomationJob) = forEachTarget(job) { c, target -> c.stopJob(target, job.id) }

    /** Stops a Claude run and carries its conversation on in a terminal on the Mac. */
    fun takeOver(job: AutomationJob) {
        val c = client ?: return
        mutable.update { it.copy(pending = it.pending + automationKey(job.takeOverIn, job.id)) }
        c.takeOverJob(job.takeOverIn, job.id)
    }

    fun setEnabled(job: AutomationJob, enabled: Boolean) =
        forEachTarget(job) { c, target -> c.setJobEnabled(target, job.id, enabled) }

    /**
     * Reading a run reads everything under it, in every folder the automation runs
     * in, since the row folds them into one unread count. [upTo] is the run that was
     * opened; null reads the whole automation. Not pending: the Mac echoes
     * `jobs-changed` once the watermark moves.
     */
    fun markSeen(job: AutomationJob, upTo: Long? = null) {
        val c = client ?: return
        if (job.unread <= 0) return
        for (target in job.runTargets) c.markJobSeen(target, job.id, upTo)
    }

    fun markAllSeen() {
        client?.markAllJobsSeen()
    }

    fun sendFollowup(
        project: String,
        jobId: String,
        at: Long,
        message: String,
        agent: String,
        model: String,
        effort: String
    ) {
        val key = automationKey(project, jobId)
        mutable.update {
            it.copy(pending = it.pending + key, followupError = it.followupError - key)
        }
        client?.sendJobFollowup(project, jobId, at, message, agent, model, effort)
    }

    /** Answer the question a job is waiting on; the first answer from any device wins. */
    fun answerQuestion(project: String, jobId: String, askId: String, answers: JsonObject) {
        beginAnswer(project, jobId)
        client?.answerJobQuestion(project, jobId, askId, answers)
    }

    fun dismissQuestion(project: String, jobId: String, askId: String) {
        beginAnswer(project, jobId)
        client?.dismissJobQuestion(project, jobId, askId)
    }

    private fun beginAnswer(project: String, jobId: String) {
        val key = automationKey(project, jobId)
        mutable.update { it.copy(pending = it.pending + key, askError = it.askError - key) }
    }

    /** Fetch a job's raw config body to seed the editor; a leftover body is dropped first. */
    fun loadJobConfig(project: String, jobId: String, source: String) {
        mutable.update {
            it.copy(
                jobConfigLoadingKey = automationKey(project, jobId),
                jobConfigBody = null,
                jobConfigError = null
            )
        }
        client?.requestJobConfig(project, jobId, source)
    }

    /** A new job starts from nothing. */
    fun clearJobConfig() = mutable.update { it.copy(jobConfigBody = null) }

    /**
     * Create or overwrite a job with the full YAML body the editor built. The reply
     * bumps [AutomationsState.mutationDoneToken] or sets the error; a silent Mac times out.
     */
    fun saveJob(id: String, source: String, project: String, job: JsonObject) {
        beginMutation()
        client?.saveJob(id, source, project, job)
    }

    fun deleteJob(id: String, source: String, project: String, deleteCopies: Boolean) {
        beginMutation()
        client?.deleteJob(id, source, project, deleteCopies)
    }

    fun dismissError() = mutable.update { it.copy(error = null) }

    fun dismissFollowupError(project: String, jobId: String) =
        mutable.update { it.copy(followupError = it.followupError - automationKey(project, jobId)) }

    fun dismissJobConfigError() = mutable.update { it.copy(jobConfigError = null) }

    fun dismissMutationError() = mutable.update { it.copy(mutationError = null) }

    private fun forEachTarget(job: AutomationJob, send: (LpmClient, String) -> Unit) {
        val c = client ?: return
        for (target in job.runTargets) {
            mutable.update { it.copy(pending = it.pending + automationKey(target, job.id)) }
            send(c, target)
        }
    }

    private fun beginMutation() {
        mutable.update { it.copy(mutationInFlight = true, mutationError = null) }
        timeout.arm(MUTATION, MUTATION_TIMEOUT_MS) {
            if (!state.value.mutationInFlight) return@arm
            mutable.update { it.copy(mutationInFlight = false, mutationError = NO_REPLY) }
        }
    }

    private fun finishMutation(error: String?, c: LpmClient) {
        timeout.cancel(MUTATION)
        if (error != null) {
            mutable.update { it.copy(mutationInFlight = false, mutationError = error) }
            return
        }
        mutable.update {
            it.copy(mutationInFlight = false, mutationDoneToken = it.mutationDoneToken + 1)
        }
        c.requestJobs()
    }

    private companion object {
        const val MUTATION = "job"
        const val MUTATION_TIMEOUT_MS = 20_000L
        const val REFRESH_SETTLE_MS = 500L
        const val NO_REPLY = "The Mac didn't respond. Try again."
    }
}

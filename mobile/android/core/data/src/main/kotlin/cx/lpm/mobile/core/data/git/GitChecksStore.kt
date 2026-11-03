package cx.lpm.mobile.core.data.git

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.requestGitChecks
import cx.lpm.mobile.core.data.client.requestGitChecksRerun
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.GitChecks
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

data class GitChecksState(
    /** A project with no entry is unknown or has nothing to show. */
    val results: Map<String, GitChecks> = emptyMap(),
    val rerunning: Set<String> = emptySet(),
    val rerunErrors: Map<String, String> = emptyMap()
)

/**
 * CI on each project's branch (iOS `GitChecksStore`): what the Mac last said about
 * it, and running the failed jobs again. The screens showing it ask again while
 * they're up.
 */
class GitChecksStore(private val session: MacSession) : SessionStore {
    private val mutable = MutableStateFlow(GitChecksState())
    val state: StateFlow<GitChecksState> = mutable.asStateFlow()

    private val client: LpmClient? get() = session.client

    val available: Boolean
        get() = client?.hostFeatures?.contains(LpmClient.GIT_CHECKS_FEATURE) == true

    override fun wire(client: LpmClient) {
        client.onGitChecks = ::apply
        client.onGitChecksRerun = ::applyRerun
    }

    override fun reset() {
        mutable.value = GitChecksState()
    }

    override fun onConnectionReset() {
        mutable.update { it.copy(rerunning = emptySet()) }
    }

    fun load(project: String) {
        if (!available) return
        client?.requestGitChecks(project)
    }

    fun rerun(project: String) {
        val ids = state.value.results[project]?.failingRunIds.orEmpty()
        if (ids.isEmpty()) return
        mutable.update {
            it.copy(rerunning = it.rerunning + project, rerunErrors = it.rerunErrors - project)
        }
        client?.requestGitChecksRerun(project, ids)
    }

    // A failed read keeps what was shown; nothing to show clears it.
    private fun apply(project: String, checks: GitChecks?, error: String?) {
        if (error != null) return
        mutable.update {
            it.copy(
                results = if (checks ==
                    null
                ) {
                    it.results - project
                } else {
                    it.results + (project to checks)
                }
            )
        }
    }

    private fun applyRerun(project: String, error: String?) {
        mutable.update { s ->
            val done = s.copy(rerunning = s.rerunning - project)
            when {
                error != null -> done.copy(rerunErrors = s.rerunErrors + (project to error))

                else -> {
                    val checks = s.results[project] ?: return@update done
                    done.copy(
                        results =
                            s.results + (project to checks.rerunning(checks.failingRunIds))
                    )
                }
            }
        }
        if (error == null) load(project)
    }
}

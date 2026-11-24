package cx.lpm.mobile.core.data.git

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.requestIssue
import cx.lpm.mobile.core.data.client.requestIssues
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.protocol.RepoIssueReply
import cx.lpm.mobile.core.protocol.RepoIssuesReply
import java.util.UUID
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withTimeoutOrNull

/** One issue as it goes in the message, or the sentence saying why it can't. */
sealed interface IssueRead {
    data class Done(val mention: String) : IssueRead

    data class Failed(val error: String) : IssueRead
}

/** The repository's open issues, for the composer's @ menu: [GitExtrasStore]'s part. */
internal class GitIssues(
    private val session: MacSession,
    private val state: MutableStateFlow<GitExtrasState>
) {
    private val asked = mutableMapOf<String, Long>()
    private val waiting = mutableMapOf<String, CompletableDeferred<RepoIssueReply?>>()

    private val client: LpmClient? get() = session.client

    /** Asks again at most once a minute; the Mac keeps its own answer for two. */
    fun load(project: String) {
        if (client?.hostFeatures?.contains(LpmClient.GIT_ISSUES_FEATURE) != true) return
        val now = session.env.clock.millis()
        val last = asked[project]
        if (last != null && now - last < EVERY_MS) return
        asked[project] = now
        client?.requestIssues(project)
    }

    /** A failure just leaves the menu without issues. */
    fun apply(reply: RepoIssuesReply) {
        val issues = reply.issues ?: return
        state.update { it.copy(issues = it.issues + (reply.project to issues)) }
    }

    suspend fun read(project: String, number: Int): IssueRead {
        val c = client ?: return IssueRead.Failed(DISCONNECTED)
        val reqId = UUID.randomUUID().toString()
        val reply = CompletableDeferred<RepoIssueReply?>()
        waiting[reqId] = reply
        val frame = try {
            c.requestIssue(project, number, reqId)
            withTimeoutOrNull(TIMEOUT_MS) { reply.await() }
                ?: return IssueRead.Failed(if (reply.isCompleted) DISCONNECTED else TIMED_OUT)
        } finally {
            waiting.remove(reqId)
        }
        return frame.mention?.let(IssueRead::Done) ?: IssueRead.Failed(frame.error.orEmpty())
    }

    fun apply(reply: RepoIssueReply) {
        waiting.remove(reply.reqId)?.complete(reply)
    }

    fun failReads() {
        waiting.values.forEach { it.complete(null) }
        waiting.clear()
    }

    fun reset() {
        asked.clear()
        failReads()
    }

    private companion object {
        const val EVERY_MS = 55_000L
        const val TIMEOUT_MS = 45_000L
        const val TIMED_OUT = "The Mac didn't answer in time."
        const val DISCONNECTED = "Lost the connection to the Mac."
    }
}

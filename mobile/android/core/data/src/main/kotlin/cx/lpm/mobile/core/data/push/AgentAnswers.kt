package cx.lpm.mobile.core.data.push

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.LpmClientFactory
import cx.lpm.mobile.core.data.client.answerAgent
import cx.lpm.mobile.core.data.link.HostProber
import cx.lpm.mobile.core.data.mac.CredentialStore
import cx.lpm.mobile.core.data.mac.MacStore
import cx.lpm.mobile.core.data.mac.ThisDevice
import cx.lpm.mobile.core.data.prefs.AppPreferences
import cx.lpm.mobile.core.data.review.ReviewAsk
import cx.lpm.mobile.core.data.session.MacSession
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Sends a notification's answer to the Mac its alert came from (iOS
 * `AgentAnswerSender`, PROTOCOL.md "Answering from a notification"): on the live link
 * when the app talks to that Mac right now, else on a short-lived connection of its
 * own, as the push sweep does. The tap may have started the process, so the stored
 * Macs and keys load first.
 */
@Singleton
class AgentAnswers @Inject constructor(
    private val prefs: AppPreferences,
    private val credentials: CredentialStore,
    private val macStore: MacStore,
    clients: LpmClientFactory,
    prober: HostProber,
    device: ThisDevice
) {
    private val errand = MacErrand(clients, prober, credentials, device.name)
    private val waiting = mutableMapOf<String, CompletableDeferred<Reply>>()
    private var session: MacSession? = null

    private data class Reply(val error: String?) {
        val outcome: AnswerOutcome get() = error?.let(AnswerOutcome::Refused) ?: AnswerOutcome.Sent
    }

    /** The live session, attached by its push store as it's built. */
    internal fun attach(session: MacSession) {
        this.session = session
    }

    /** An answer the Mac took is a win toward asking for a rating. */
    suspend fun send(answer: AgentAnswer): AnswerOutcome =
        deliver(answer).also { if (it == AnswerOutcome.Sent) ReviewAsk.win(prefs) }

    private suspend fun deliver(answer: AgentAnswer): AnswerOutcome {
        if (!prefs.isLoaded) prefs.load()
        if (!credentials.isLoaded) credentials.load()
        val mac = macStore.loadRecords().firstOrNull {
            it.via == null && !answer.serverId.isNullOrEmpty() && it.serverId == answer.serverId
        }
        val live = liveClient(answer.serverId)
        return withTimeoutOrNull(BUDGET_MS) {
            if (live != null) {
                val reply = withTimeoutOrNull(LIVE_MS) { overLive(live.first, answer) }
                if (reply != null) return@withTimeoutOrNull reply.outcome
                // A quiet link: the Mac takes only the first answer to a prompt, so an
                // Allow or Deny can be tried again on a connection of its own; a reply
                // isn't sent twice.
                if (answer.action == AgentAnswerAction.Reply) {
                    return@withTimeoutOrNull AnswerOutcome.Unreachable(live.second)
                }
            }
            if (mac == null) return@withTimeoutOrNull AnswerOutcome.UnknownMac
            errand.run<Reply>(mac, BUDGET_MS) { c, done ->
                val reqId = UUID.randomUUID().toString()
                c.onAnswerAgent = { id, error -> if (id == reqId) done(Reply(error)) }
                c.answerAgent(answer, reqId)
            }?.outcome ?: AnswerOutcome.Unreachable(mac.displayName)
        } ?: AnswerOutcome.Unreachable(mac?.displayName ?: live?.second)
    }

    /** The live Mac's reply to an answer sent over its link. */
    internal fun delivered(reqId: String, error: String?) {
        waiting.remove(reqId)?.complete(Reply(error))
    }

    /** The live link and its Mac's name, when it is with the alert's Mac. */
    private fun liveClient(serverId: String?): Pair<LpmClient, String>? {
        val s = session ?: return null
        val state = s.state.value
        val record = state.activeRecord ?: return null
        if (!state.isReady || state.demoMode || record.via != null) return null
        if (serverId.isNullOrEmpty() || record.serverId != serverId) return null
        val client = s.client ?: return null
        if (LpmClient.ANSWER_AGENT_FEATURE !in client.hostFeatures) return null
        return client to record.displayName
    }

    private suspend fun overLive(client: LpmClient, answer: AgentAnswer): Reply {
        val reqId = UUID.randomUUID().toString()
        val reply = CompletableDeferred<Reply>()
        waiting[reqId] = reply
        return try {
            client.answerAgent(answer, reqId)
            reply.await()
        } finally {
            waiting.remove(reqId)
        }
    }

    private companion object {
        // The phone may have to find the Mac first; past this the user is told it failed.
        const val BUDGET_MS = 25_000L

        // A live link that says nothing for this long is likely dead.
        const val LIVE_MS = 10_000L
    }
}

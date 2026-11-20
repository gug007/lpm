package cx.lpm.mobile.feature.mac.data

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.answerGenerate
import cx.lpm.mobile.core.data.client.requestGenerateRequests
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.GenerateRequest
import cx.lpm.mobile.core.model.trimmingWhitespace
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/** The `lpm generate` requests waiting on the session's Mac. */
data class GenerateState(
    val requests: List<GenerateRequest> = emptyList(),
    /** The request whose answer is on its way. */
    val answering: String? = null,
    val error: String? = null,
    /** Requests swiped away here; they stay open on the Mac. */
    val setAside: Set<String> = emptySet()
) {
    /** The request the sheet shows: the oldest one not set aside. */
    val shown: GenerateRequest? get() = requests.firstOrNull { it.id !in setAside }
    val waiting: Int get() = maxOf(0, requests.size - 1)
}

/**
 * The Mac owns the list and pushes it whenever it changes; this mirrors it and sends
 * the answer back (iOS `GenerateStore`).
 */
class GenerateStore(private val session: MacSession) : SessionStore {
    private val mutable = MutableStateFlow(GenerateState())
    val state: StateFlow<GenerateState> = mutable.asStateFlow()

    override fun wire(client: LpmClient) {
        client.onGenerateRequests = { if (client === session.client) apply(it) }
        client.onAnswerGenerate =
            { id, error -> if (client === session.client) answered(id, error) }
    }

    override fun reset() {
        mutable.value = GenerateState()
    }

    override fun onReady(client: LpmClient) {
        if (client.hostFeatures.contains(LpmClient.GENERATE_APPROVAL_FEATURE)) {
            client.requestGenerateRequests()
        } else {
            mutable.update { it.copy(requests = emptyList()) }
        }
    }

    override fun onConnectionReset() {
        mutable.update { it.copy(answering = null, error = null) }
    }

    private fun apply(list: List<GenerateRequest>) {
        val open = list.map { it.id }.toSet()
        mutable.update {
            it.copy(
                requests = list,
                setAside = it.setAside intersect open,
                answering = it.answering?.takeIf { id -> id in open }
            )
        }
    }

    private fun answered(id: String, error: String?) {
        mutable.update {
            it.copy(
                answering = it.answering?.takeIf { current -> current != id },
                error = error,
                requests = it.requests.filter { r -> error != null || r.id != id }
            )
        }
    }

    fun answer(request: GenerateRequest, decision: String, prompt: String, key: String) {
        mutable.update { it.copy(error = null, answering = request.id) }
        val edited = prompt.trimmingWhitespace()
        session.client?.answerGenerate(
            id = request.id,
            decision = decision,
            prompt = edited.takeIf { it.isNotEmpty() && it != request.prompt },
            key = if (decision == "deny") null else key.trimmingWhitespace()
        )
    }

    fun setAside(request: GenerateRequest) {
        mutable.update { it.copy(setAside = it.setAside + request.id) }
    }
}

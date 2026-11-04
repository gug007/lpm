package cx.lpm.mobile.core.data.dictation

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.sendLive
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionStore

/** A session's side of a take its Mac transcribes: that Mac's answers reach the take. */
class DictationLink(private val session: MacSession) : SessionStore {
    private var take: ComputerDictationEngine? = null

    override fun wire(client: LpmClient) {
        client.onDictation = { take?.apply(it) }
    }

    override fun reset() = endTake()

    override fun onConnectionReset() = endTake()

    /** A take for this session's Mac, or null if it can't transcribe one. */
    internal fun newTake(): DictationEngine? {
        val client = session.client ?: return null
        val offered = client.hostFeatures?.contains(LpmClient.DICTATION_FEATURE) == true
        if (!session.state.value.isReady || !offered) return null
        return ComputerDictationEngine(
            send = client::sendLive,
            post = client::post,
            scope = session.scope,
            microphone = AudioRecordMicrophone()
        ).also { take = it }
    }

    private fun endTake() {
        take?.linkLost()
        take = null
    }
}

package cx.lpm.mobile.feature.mac.data

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.keepAwake
import cx.lpm.mobile.core.data.client.keepAwakeSet
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.MacKeepAwake
import java.time.Clock
import java.time.Instant
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/** What the phone knows of Keep awake on the session's Mac. */
data class KeepAwakeState(
    val keepAwake: MacKeepAwake? = null,
    /** When the set time or the after-agents countdown ends, on this phone's clock. */
    val endsAt: Instant? = null,
    val error: String? = null,
    /** When it arrived: a tick from before then would count it from too early. */
    val at: Instant = Instant.EPOCH
) {
    fun leftSeconds(now: Instant): Double? = endsAt?.let {
        maxOf(0.0, (it.toEpochMilli() - maxOf(now, at).toEpochMilli()) / 1000.0)
    }
}

/**
 * Keep awake on the session's Mac. The Mac owns it; this mirrors what it reports and
 * asks it to change (iOS `KeepAwakeStore`).
 */
class KeepAwakeStore(private val session: MacSession, private val clock: Clock) : SessionStore {
    private val mutable = MutableStateFlow(KeepAwakeState())
    val state: StateFlow<KeepAwakeState> = mutable.asStateFlow()

    override fun wire(client: LpmClient) {
        client.onKeepAwake = { if (client === session.client) apply(it) }
        client.onKeepAwakeSet = { next, error ->
            if (client === session.client) {
                if (next != null) apply(next)
                mutable.update { it.copy(error = error) }
            }
        }
    }

    override fun reset() {
        mutable.value = KeepAwakeState()
    }

    override fun onReady(client: LpmClient) {
        if (client.hostFeatures.contains(LpmClient.KEEP_AWAKE_FEATURE)) {
            client.keepAwake()
        } else {
            mutable.value = KeepAwakeState()
        }
    }

    override fun onConnectionReset() {
        mutable.update { it.copy(error = null) }
    }

    fun apply(next: MacKeepAwake) {
        val now = clock.instant()
        mutable.update {
            it.copy(keepAwake = next, endsAt = next.endsIn?.let(now::plusMillis), at = now)
        }
    }

    fun set(mode: MacKeepAwake.Mode, minutes: Int? = null) {
        mutable.update { it.copy(error = null) }
        session.client?.keepAwakeSet(mode, minutes)
    }
}

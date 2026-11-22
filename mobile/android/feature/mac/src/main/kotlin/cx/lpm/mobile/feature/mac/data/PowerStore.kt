package cx.lpm.mobile.feature.mac.data

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.lockScreen
import cx.lpm.mobile.core.data.client.power
import cx.lpm.mobile.core.data.client.sleepNow
import cx.lpm.mobile.core.data.client.sleepWhenIdle
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.MacPower
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/** What the phone knows of Lock or Sleep on the session's Mac. */
data class PowerState(
    val power: MacPower? = null,
    /** Sleep Now was picked and waits for the person to confirm it. */
    val confirmingSleep: Boolean = false
)

/**
 * Lock or sleep on the session's Mac. The Mac owns whether it sleeps once its agents
 * finish; this mirrors what it reports and asks it to act (iOS `PowerStore`).
 */
class PowerStore(private val session: MacSession) : SessionStore {
    private val mutable = MutableStateFlow(PowerState())
    val state: StateFlow<PowerState> = mutable.asStateFlow()

    override fun wire(client: LpmClient) {
        client.onPower = { next -> if (client === session.client) apply(next) }
        client.onPowerSet = { _, next, error ->
            if (client === session.client) {
                if (next != null) apply(next)
                if (error != null) session.alerts.showError(error)
            }
        }
    }

    override fun reset() {
        mutable.value = PowerState()
    }

    override fun onReady(client: LpmClient) {
        if (client.hostFeatures.contains(LpmClient.POWER_FEATURE)) {
            client.power()
        } else {
            mutable.value = PowerState()
        }
    }

    fun apply(next: MacPower) {
        mutable.update { it.copy(power = next) }
    }

    fun lock() {
        session.client?.lockScreen()
    }

    fun askToSleep() {
        mutable.update { it.copy(confirmingSleep = true) }
    }

    fun cancelSleep() {
        mutable.update { it.copy(confirmingSleep = false) }
    }

    fun sleepNow() {
        mutable.update { it.copy(confirmingSleep = false) }
        session.client?.sleepNow()
    }

    fun sleepWhenIdle(on: Boolean) {
        session.client?.sleepWhenIdle(on)
    }
}

package cx.lpm.mobile.core.data.session

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.launchLpm
import cx.lpm.mobile.core.data.push.MacErrand
import kotlinx.coroutines.launch

/**
 * Open lpm (iOS `AppModel+OpenLpm`): when lpm was closed on the active Mac, its login
 * helper, on the port `ready` named as `launcher`, starts it, and the link reconnects
 * once it's up.
 */
internal class MacOpenLpm(private val s: MacSession) {
    private val errand by lazy {
        MacErrand(s.env.clients, s.env.prober, s.env.credentials, s.env.device.name)
    }

    /** Keep the port a Mac says its login helper answers on. */
    fun remember(serverId: String?, port: Int?) {
        if (s.state.value.demoMode || serverId.isNullOrEmpty()) return
        val record =
            s.state.value.macs.firstOrNull { it.serverId == serverId && it.via == null } ?: return
        if (record.launcher == port) return
        s.updateMac(record.localId) { it.copy(launcher = port) }
        s.persistMacs()
    }

    fun openActive() {
        val mac = s.state.value.activeRecord ?: return
        val port = mac.launcher ?: return
        if (s.link.state.value.openingLpm) return
        s.link.update { it.copy(openingLpm = true) }
        s.env.scope.launch {
            var refusal: String? = null
            val ok = errand.run<Boolean>(mac, TIMEOUT_MS, port) { client, done ->
                if (LpmClient.LAUNCH_LPM_FEATURE in client.hostFeatures) {
                    client.onLaunchLpm = { error ->
                        refusal = error
                        done(error == null)
                    }
                    client.launchLpm()
                } else {
                    done(false)
                }
            } == true
            s.link.update { it.copy(openingLpm = false) }
            if (s.state.value.activeMacId != mac.localId) return@launch
            if (ok) {
                s.retryConnection()
            } else {
                s.alerts.showError(
                    refusal ?: "Couldn't reach ${mac.displayName}. Opening lpm from here works " +
                        "on the same network or over the Tailscale app."
                )
            }
        }
    }

    private companion object {
        /** Long enough for a cold start, which the helper waits out before it answers. */
        const val TIMEOUT_MS = 100_000L
    }
}

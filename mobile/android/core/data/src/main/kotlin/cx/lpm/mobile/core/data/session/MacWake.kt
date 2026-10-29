package cx.lpm.mobile.core.data.session

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.requestWake
import cx.lpm.mobile.core.data.link.AddressKind
import cx.lpm.mobile.core.data.mac.MacRecord
import cx.lpm.mobile.core.data.push.MacErrand
import cx.lpm.mobile.core.model.WakeTarget
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Waking the active Mac when it sleeps (iOS `AppModel+Wake`, PROTOCOL.md "Waking a
 * sleeping Mac"): wake packets from this phone, to each card and its network's
 * broadcast address, a knock on the lpm port at each home address for a Bonjour Sleep
 * Proxy, the same asked of every other saved machine that answers, then reconnecting
 * for a minute while the Mac comes up.
 */
internal class MacWake(private val s: MacSession) {
    private val errand by lazy {
        MacErrand(s.env.clients, s.env.prober, s.env.credentials, s.env.device.name)
    }

    /** Reconnecting after a Wake tap; another tap starts it over. */
    private var retry: Job? = null

    /** Keep what a Mac says it can be woken through. */
    fun rememberTargets(serverId: String?, targets: List<WakeTarget>) {
        if (s.state.value.demoMode || serverId.isNullOrEmpty()) return
        val record =
            s.state.value.macs.firstOrNull { it.serverId == serverId && it.via == null } ?: return
        val next = targets.ifEmpty { null }
        if (record.wake == next) return
        s.updateMac(record.localId) { it.copy(wake = next) }
        s.persistMacs()
    }

    fun wakeActive() {
        val mac = s.state.value.activeRecord ?: return
        s.link.update { it.copy(wakeSentAt = s.env.clock.millis()) }
        if (s.state.value.demoMode) return
        val targets = mac.wake.orEmpty()
        if (mac.via == null) {
            val home = mac.hosts.filter { AddressKind.of(it) == AddressKind.Home }
            s.env.scope.launch(Dispatchers.IO) { sendDirectly(targets, home, mac.port) }
        }
        if (targets.isNotEmpty()) askOthers(mac, targets)
        retryWhileWaking(mac.localId)
    }

    private fun askOthers(mac: MacRecord, targets: List<WakeTarget>) {
        val others = s.state.value.macs.filter { it.localId != mac.localId && it.via == null }
        for (other in others) {
            s.env.scope.launch {
                errand.run<Boolean>(other, ERRAND_MS) { client, done ->
                    if (LpmClient.WAKE_FEATURE in client.hostFeatures) {
                        client.onWake = done
                        client.requestWake(targets, mac.port)
                    } else {
                        done(false)
                    }
                }
            }
        }
    }

    private fun retryWhileWaking(localId: String) {
        retry?.cancel()
        retry = s.env.scope.launch {
            repeat(RETRIES) {
                delay(RETRY_GAP_MS)
                if (s.state.value.activeMacId != localId || s.state.value.isReady) return@launch
                s.retryConnection()
            }
        }
    }

    private fun sendDirectly(targets: List<WakeTarget>, homeHosts: List<String>, port: Int) {
        runCatching {
            DatagramSocket().use { socket ->
                socket.broadcast = true
                for (target in targets) {
                    val mac = WakeTarget.hardwareAddress(target.mac) ?: continue
                    val packet = WakeTarget.magicPacket(mac)
                    for (host in listOf(target.ip, target.broadcast)) {
                        val address =
                            runCatching { InetAddress.getByName(host) }.getOrNull() ?: continue
                        for (wolPort in WOL_PORTS) {
                            runCatching {
                                socket.send(DatagramPacket(packet, packet.size, address, wolPort))
                            }
                        }
                    }
                }
            }
        }
        for (host in (homeHosts + targets.map { it.ip }).toSet()) {
            runCatching { Socket().use { it.connect(InetSocketAddress(host, port), KNOCK_MS) } }
        }
    }

    private companion object {
        val WOL_PORTS = listOf(9, 7)
        const val KNOCK_MS = 2_000
        const val ERRAND_MS = 8_000L
        const val RETRIES = 6
        const val RETRY_GAP_MS = 10_000L
    }
}

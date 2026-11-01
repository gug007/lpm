package cx.lpm.mobile.core.data.machines

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.LpmClientFactory
import cx.lpm.mobile.core.data.client.requestProjects
import cx.lpm.mobile.core.data.link.HostProber
import cx.lpm.mobile.core.data.mac.CredentialStore
import cx.lpm.mobile.core.data.mac.MacRecord
import cx.lpm.mobile.core.model.Project
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** What a [MachineFeedLink] needs to reach its machine. */
internal class FeedLinkEnvironment(
    val scope: CoroutineScope,
    val clients: LpmClientFactory,
    val prober: HostProber,
    val credentials: CredentialStore,
    val deviceName: String
)

/**
 * One saved machine's read-only link (iOS `FeedLink`): find an address that answers,
 * connect, ask for the projects and ask again whenever they or their agents change.
 */
internal class MachineFeedLink(
    private val record: MacRecord,
    private val credential: LpmClient.Credential,
    private val env: FeedLinkEnvironment,
    private val onUpdate: (Update) -> Unit
) {
    sealed interface Update {
        data class State(val state: MachineFeed.State) : Update

        data class Projects(val projects: List<Project>) : Update
    }

    private var client: LpmClient? = null
    private var retry: Job? = null
    private var refresh: Job? = null
    private var failures = 0
    private var stopped = false
    private var dialing = false

    fun start() {
        if (stopped || dialing) return
        dialing = true
        onUpdate(Update.State(MachineFeed.State.Connecting))
        env.scope.launch {
            val host = reach()
            if (stopped) return@launch
            dialing = false
            if (host == null) failed() else connect(host)
        }
    }

    /** The phone came back on screen: a link waiting out a failure tries again now. */
    fun retryNow() {
        val waiting = retry ?: return
        waiting.cancel()
        retry = null
        failures = 0
        start()
    }

    fun stop() {
        stopped = true
        retry?.cancel()
        refresh?.cancel()
        teardown()
    }

    private suspend fun reach(): String? {
        val identity = HostProber.Identity(pin = env.credentials.loadPin(record.localId))
        val hosts = record.hosts.filter { it.isNotEmpty() }
        return if (hosts.size == 1) {
            hosts.single().takeIf {
                env.prober.open(it, record.port, identity, PROBE_TIMEOUT_MS).reachable
            }
        } else {
            env.prober.race(hosts, record.port, identity, PROBE_TIMEOUT_MS).winner
        }
    }

    private fun connect(host: String) {
        val localId = record.localId
        val c = env.clients.create(
            endpoint = LpmClient.Endpoint(host, record.port),
            credential = credential,
            deviceName = env.deviceName,
            pinProvider = { env.credentials.loadPin(localId) }
        )
        // Away, so this machine still sends its notifications.
        c.inForeground = false
        client = c
        c.onState = { state ->
            when (state) {
                LpmClient.State.Ready -> {
                    failures = 0
                    onUpdate(Update.State(MachineFeed.State.Ready))
                    c.requestProjects()
                }

                is LpmClient.State.Failed -> failed()

                LpmClient.State.Idle, LpmClient.State.Connecting -> Unit
            }
        }
        c.onProjects = { onUpdate(Update.Projects(it)) }
        c.onProjectsChanged = ::refreshSoon
        c.onStatusChanged = { refreshSoon() }
        c.connect()
    }

    /** A burst of agent updates asks for the list once. */
    private fun refreshSoon() {
        refresh?.cancel()
        refresh = env.scope.launch {
            delay(REFRESH_DELAY_MS)
            client?.requestProjects()
        }
    }

    /**
     * Hang up and look for the machine again after a wait that grows, since it may
     * have moved to another network meanwhile.
     */
    private fun failed() {
        teardown()
        if (stopped) return
        onUpdate(Update.State(MachineFeed.State.Offline))
        val wait = RETRY_DELAYS_MS[minOf(failures, RETRY_DELAYS_MS.lastIndex)]
        failures += 1
        retry = env.scope.launch {
            delay(wait)
            retry = null
            start()
        }
    }

    private fun teardown() {
        val c = client ?: return
        client = null
        c.onState = null
        c.onProjects = null
        c.onProjectsChanged = null
        c.onStatusChanged = null
        c.shutdown()
    }

    private companion object {
        const val PROBE_TIMEOUT_MS = 6_000L
        const val REFRESH_DELAY_MS = 400L
        val RETRY_DELAYS_MS = listOf(5_000L, 15_000L, 30_000L, 60_000L)
    }
}

package cx.lpm.mobile.core.data.session

import cx.lpm.mobile.core.data.client.LpmClientFactory
import cx.lpm.mobile.core.data.client.TailnetRouter
import cx.lpm.mobile.core.data.link.HostProber
import cx.lpm.mobile.core.data.link.MacBrowser
import cx.lpm.mobile.core.data.link.NetworkMonitor
import cx.lpm.mobile.core.data.mac.AgentTabSnapshots
import cx.lpm.mobile.core.data.mac.CredentialStore
import cx.lpm.mobile.core.data.mac.MacStore
import cx.lpm.mobile.core.data.mac.MacUnpair
import cx.lpm.mobile.core.data.mac.ProjectSnapshots
import cx.lpm.mobile.core.data.mac.ThisDevice
import cx.lpm.mobile.core.data.prefs.AppPreferences
import java.time.Clock
import kotlinx.coroutines.CoroutineScope

/**
 * What every [MacSession] shares: the app scope (main thread, where all session and
 * store state changes), persistence, the network side, and the store factories.
 */
class SessionEnvironment(
    val scope: CoroutineScope,
    val clock: Clock,
    val prefs: AppPreferences,
    val macStore: MacStore,
    val credentials: CredentialStore,
    val snapshots: ProjectSnapshots,
    val agentTabs: AgentTabSnapshots,
    val network: NetworkMonitor,
    /** A fresh browse for each owner (recovery, the pairing screen, the endpoint editor). */
    val newBrowser: () -> MacBrowser,
    val prober: HostProber,
    val clients: LpmClientFactory,
    val device: ThisDevice,
    val tailnet: TailnetRouter,
    val unpair: MacUnpair,
    val storeFactories: Set<SessionStore.Factory>
)

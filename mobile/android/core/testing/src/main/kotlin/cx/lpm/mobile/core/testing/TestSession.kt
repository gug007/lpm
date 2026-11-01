package cx.lpm.mobile.core.testing

import cx.lpm.mobile.core.data.client.ClientEnvironment
import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.LpmClientFactory
import cx.lpm.mobile.core.data.di.DataModule
import cx.lpm.mobile.core.data.mac.CredentialStore
import cx.lpm.mobile.core.data.mac.MacRecord
import cx.lpm.mobile.core.data.mac.MacStore
import cx.lpm.mobile.core.data.mac.MacUnpair
import cx.lpm.mobile.core.data.mac.ProjectSnapshots
import cx.lpm.mobile.core.data.mac.ThisDevice
import cx.lpm.mobile.core.data.machines.MachineImporter
import cx.lpm.mobile.core.data.machines.PairedMachineFeeds
import cx.lpm.mobile.core.data.prefs.AppPreferences
import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.data.session.SessionEnvironment
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.data.terminals.TerminalsStore
import cx.lpm.mobile.core.data.tips.TipsStore
import java.io.File
import java.nio.file.Files
import kotlin.random.Random
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope

/**
 * A real live [MacSession] wired to fakes, for ViewModel and store tests outside
 * `:core:data`: a scripted [transport] instead of sockets, in-memory DataStores, a
 * [prober] table, a [browser] the test fills, [tailscale] off, and the real Projects
 * and Terminals stores plus any [stores] the test adds. Everything runs on `test`'s
 * scheduler, so timers move with virtual time; ViewModels get [sessions].
 */
class TestSession(test: TestScope, stores: Set<SessionStore.Factory> = emptySet()) {
    private val scope = test.backgroundScope
    val scheduler = test.testScheduler
    val clock = SchedulerClock(scheduler)
    val transport = FakeTransport()
    val prefsStore = InMemoryDataStore()
    val credentialsStore = InMemoryDataStore()
    val prefs = AppPreferences(prefsStore, scope)
    val credentials = CredentialStore(credentialsStore, FakeCipher(), scope)
    val macStore = MacStore(prefs)
    val network = FakeNetworkMonitor()
    val browser = FakeMacBrowser()
    val prober = FakeHostProber()
    val tailscale = FakeTailscale()
    val device = ThisDevice("Test Phone")
    val snapshotDir: File = Files.createTempDirectory("lpm-snapshots").toFile()
    val clients = LpmClientFactory(
        ClientEnvironment(scope, clock, transport, tailscale, { credentials.phoneId }, Random(SEED))
    )
    val env = SessionEnvironment(
        scope = scope,
        clock = clock,
        prefs = prefs,
        macStore = macStore,
        credentials = credentials,
        snapshots = ProjectSnapshots(snapshotDir, scope, StandardTestDispatcher(scheduler), clock),
        network = network,
        newBrowser = { browser },
        prober = prober,
        clients = clients,
        device = device,
        tailnet = tailscale,
        unpair = MacUnpair(scope, transport, tailscale, credentials, clock),
        storeFactories = setOf(
            SessionStore.Factory(::ProjectsStore),
            SessionStore.Factory(::TerminalsStore)
        ) + stores
    )
    val session: MacSession = DataModule.macSession(env)
    val sessions = MacSessions(session)
    val tips = TipsStore(prefs)

    /** Show All Machines; needs a [MachineImporter] among the session's stores. */
    val feeds: PairedMachineFeeds by lazy {
        PairedMachineFeeds(session, prefs, credentials, clients, prober, device, scope)
    }

    inline fun <reified T : SessionStore> store(): T = session.store()

    /** A saved, paired Mac at `host`, made active, with its credential stored. */
    fun savedMac(
        host: String = "192.168.1.20",
        serverId: String = "srv-1",
        name: String = "Studio Mac"
    ): MacRecord {
        val record = MacRecord(
            localId = MacRecord.newLocalId(),
            serverId = serverId,
            name = name,
            hosts = listOf(host),
            port = 8765
        )
        macStore.saveRecords(macStore.loadRecords() + record)
        macStore.saveActiveId(record.localId)
        credentials.save("dev-1", "tok-1", record.localId)
        return record
    }

    /** Connect the session to a saved Mac and bring the link to `ready`, answering [features]. */
    fun connectReady(
        record: MacRecord = savedMac(),
        features: List<String> = emptyList()
    ): FakeSocket {
        session.bootstrap()
        scheduler.runCurrent()
        val socket = transport.last
        socket.open()
        scheduler.runCurrent()
        val answers = features.joinToString(",") { "\"$it\"" }
        socket.receive(
            """{"t":"ready","serverId":"${record.serverId}","serverName":"${record.name}",""" +
                """"features":[$answers]}"""
        )
        scheduler.runCurrent()
        check(session.state.value.connection == LpmClient.State.Ready)
        return socket
    }

    /** Enter Demo Mode and let the in-process Mac answer. */
    fun enterDemo() {
        session.enterDemo()
        scheduler.runCurrent()
    }

    private companion object {
        const val SEED = 7
    }
}

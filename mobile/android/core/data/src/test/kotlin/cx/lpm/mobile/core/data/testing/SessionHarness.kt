package cx.lpm.mobile.core.data.testing

import cx.lpm.mobile.core.data.actions.ActionPopupStore
import cx.lpm.mobile.core.data.actions.ActionsStore
import cx.lpm.mobile.core.data.agents.AgentDialogStore
import cx.lpm.mobile.core.data.agents.AgentLaunchStore
import cx.lpm.mobile.core.data.automations.AutomationsStore
import cx.lpm.mobile.core.data.claude.ClaudeAccountsStore
import cx.lpm.mobile.core.data.client.ClientEnvironment
import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.LpmClientFactory
import cx.lpm.mobile.core.data.client.NoTailnet
import cx.lpm.mobile.core.data.config.ProjectConfigStore
import cx.lpm.mobile.core.data.files.ProjectFilesStore
import cx.lpm.mobile.core.data.git.GitAutoStore
import cx.lpm.mobile.core.data.git.GitHistoryStore
import cx.lpm.mobile.core.data.git.GitStore
import cx.lpm.mobile.core.data.mac.CredentialStore
import cx.lpm.mobile.core.data.mac.MacRecord
import cx.lpm.mobile.core.data.mac.MacStore
import cx.lpm.mobile.core.data.mac.MacUnpair
import cx.lpm.mobile.core.data.mac.ProjectSnapshots
import cx.lpm.mobile.core.data.mac.ThisDevice
import cx.lpm.mobile.core.data.machines.MachineImporter
import cx.lpm.mobile.core.data.prefs.AppPreferences
import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.push.AgentAnswers
import cx.lpm.mobile.core.data.push.PushRegistrar
import cx.lpm.mobile.core.data.push.PushStore
import cx.lpm.mobile.core.data.push.ResolvedPush
import cx.lpm.mobile.core.data.services.ServiceLogsStore
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionEnvironment
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.data.terminals.TerminalsStore
import cx.lpm.mobile.core.data.usage.StatsStore
import cx.lpm.mobile.core.data.usage.UsageStore
import cx.lpm.mobile.core.data.usage.WeeklyRecapStore
import java.io.File
import java.nio.file.Files
import kotlin.random.Random
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope

/**
 * A live session wired to fakes: a scripted transport instead of sockets, in-memory
 * DataStores, a probe table, and the real Projects/Terminals stores. Everything runs
 * on the test scheduler, so timers move with virtual time.
 */
class SessionHarness(test: TestScope) {
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
    val snapshotDir: File = Files.createTempDirectory("lpm-snapshots").toFile()
    val clients = LpmClientFactory(
        ClientEnvironment(scope, clock, transport, NoTailnet, { credentials.phoneId }, Random(SEED))
    )
    val pushTokens = FakePushTokens()
    val registrar = PushRegistrar(
        ResolvedPush(pushTokens),
        credentials,
        prefs,
        clients,
        prober,
        ThisDevice("Test Phone"),
        scope
    )
    val answers =
        AgentAnswers(prefs, credentials, macStore, clients, prober, ThisDevice("Test Phone"))
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
        device = ThisDevice("Test Phone"),
        tailnet = NoTailnet,
        unpair = MacUnpair(scope, transport, NoTailnet, credentials, clock),
        storeFactories = setOf(
            SessionStore.Factory(::ProjectsStore),
            SessionStore.Factory(::TerminalsStore),
            SessionStore.Factory(::AutomationsStore),
            SessionStore.Factory(::GitStore),
            SessionStore.Factory(::GitHistoryStore),
            SessionStore.Factory(::GitAutoStore),
            SessionStore.Factory(::ServiceLogsStore),
            SessionStore.Factory(::ProjectConfigStore),
            SessionStore.Factory(::UsageStore),
            SessionStore.Factory(::StatsStore),
            SessionStore.Factory(::WeeklyRecapStore),
            SessionStore.Factory(::ClaudeAccountsStore),
            SessionStore.Factory(::ActionsStore),
            SessionStore.Factory(::ActionPopupStore),
            SessionStore.Factory(::MachineImporter),
            SessionStore.Factory(::AgentLaunchStore),
            SessionStore.Factory(::AgentDialogStore),
            SessionStore.Factory(::ProjectFilesStore),
            SessionStore.Factory { PushStore(it, registrar, answers) }
        )
    )
    val session = MacSession(env, visitHost = null)
    val projects: ProjectsStore get() = session.store()
    val terminals: TerminalsStore get() = session.store()

    /** A saved, paired Mac at `host`, made active, with its credential stored. */
    fun savedMac(host: String = "192.168.1.20", serverId: String = "srv-1"): MacRecord {
        val record = MacRecord(
            localId = MacRecord.newLocalId(),
            serverId = serverId,
            name = "Studio Mac",
            hosts = listOf(host),
            port = 8765
        )
        macStore.saveRecords(listOf(record))
        macStore.saveActiveId(record.localId)
        credentials.save("dev-1", "tok-1", record.localId)
        return record
    }

    /** Connect the session to a saved Mac and bring the link to `ready`. */
    fun connectReady(features: List<String> = emptyList()): FakeSocket {
        val record = savedMac()
        session.bootstrap()
        scheduler.runCurrent()
        val socket = transport.last
        socket.open()
        scheduler.runCurrent()
        val answers = features.joinToString(",") { "\"$it\"" }
        socket.receive(
            """{"t":"ready","serverId":"${record.serverId}","serverName":"Studio Mac",""" +
                """"features":[$answers]}"""
        )
        scheduler.runCurrent()
        check(session.state.value.connection == LpmClient.State.Ready)
        return socket
    }

    private companion object {
        const val SEED = 7
    }
}

package cx.lpm.mobile.core.data.di

import android.content.Context
import android.os.Build
import android.provider.Settings
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStoreFile
import cx.lpm.mobile.core.data.actions.ActionsStore
import cx.lpm.mobile.core.data.agents.AgentLaunchStore
import cx.lpm.mobile.core.data.automations.AutomationsStore
import cx.lpm.mobile.core.data.claude.ClaudeAccountsStore
import cx.lpm.mobile.core.data.client.ClientEnvironment
import cx.lpm.mobile.core.data.client.LpmClientFactory
import cx.lpm.mobile.core.data.client.NoTailnet
import cx.lpm.mobile.core.data.client.OkHttpTransport
import cx.lpm.mobile.core.data.client.SocketTransport
import cx.lpm.mobile.core.data.client.TailnetRouter
import cx.lpm.mobile.core.data.commands.LpmCommandsStore
import cx.lpm.mobile.core.data.config.ProjectConfigStore
import cx.lpm.mobile.core.data.files.ProjectFilesStore
import cx.lpm.mobile.core.data.git.GitAutoStore
import cx.lpm.mobile.core.data.git.GitHistoryStore
import cx.lpm.mobile.core.data.git.GitStore
import cx.lpm.mobile.core.data.link.ConnectivityNetworkMonitor
import cx.lpm.mobile.core.data.link.HostProber
import cx.lpm.mobile.core.data.link.MacBrowser
import cx.lpm.mobile.core.data.link.NetworkMonitor
import cx.lpm.mobile.core.data.link.NsdMacBrowser
import cx.lpm.mobile.core.data.link.OkHttpHostProber
import cx.lpm.mobile.core.data.mac.CredentialStore
import cx.lpm.mobile.core.data.mac.KeystoreCipher
import cx.lpm.mobile.core.data.mac.MacStore
import cx.lpm.mobile.core.data.mac.MacUnpair
import cx.lpm.mobile.core.data.mac.ProjectSnapshots
import cx.lpm.mobile.core.data.mac.SecretCipher
import cx.lpm.mobile.core.data.mac.ThisDevice
import cx.lpm.mobile.core.data.machines.MachineImporter
import cx.lpm.mobile.core.data.prefs.AppPreferences
import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.push.AgentAnswers
import cx.lpm.mobile.core.data.push.NoPushTokens
import cx.lpm.mobile.core.data.push.PushRegistrar
import cx.lpm.mobile.core.data.push.PushStore
import cx.lpm.mobile.core.data.push.PushTokenSource
import cx.lpm.mobile.core.data.push.ResolvedPush
import cx.lpm.mobile.core.data.services.ServiceLogsStore
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionEnvironment
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.data.terminals.TerminalsStore
import cx.lpm.mobile.core.data.usage.StatsStore
import cx.lpm.mobile.core.data.usage.UsageStore
import cx.lpm.mobile.core.data.usage.WeeklyRecapStore
import dagger.Binds
import dagger.BindsOptionalOf
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import dagger.multibindings.Multibinds
import java.io.File
import java.time.Clock
import java.util.Optional
import javax.inject.Provider
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import okhttp3.OkHttpClient

@Module
@InstallIn(SingletonComponent::class)
object DataModule {
    @Provides
    @Singleton
    @ApplicationScope
    fun applicationScope(): CoroutineScope =
        CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    @Provides
    fun clock(): Clock = Clock.systemDefaultZone()

    @Provides
    @Singleton
    fun okHttpClient(): OkHttpClient = OkHttpTransport.baseClient()

    @Provides
    @Singleton
    @PreferencesDataStore
    fun preferencesDataStore(@ApplicationContext context: Context): DataStore<Preferences> =
        PreferenceDataStoreFactory.create(scope = ioScope()) {
            context.preferencesDataStoreFile("preferences")
        }

    @Provides
    @Singleton
    @CredentialsDataStore
    fun credentialsDataStore(@ApplicationContext context: Context): DataStore<Preferences> =
        PreferenceDataStoreFactory.create(scope = ioScope()) {
            context.preferencesDataStoreFile("credentials")
        }

    @Provides
    @Singleton
    fun thisDevice(@ApplicationContext context: Context): ThisDevice {
        val name = Settings.Global.getString(context.contentResolver, Settings.Global.DEVICE_NAME)
        return ThisDevice(name = name?.ifBlank { null } ?: Build.MODEL)
    }

    @Provides
    fun tailnetRouter(router: Optional<TailnetRouter>): ResolvedTailnet =
        ResolvedTailnet(router.orElse(NoTailnet))

    @Provides
    fun pushTokens(source: Optional<PushTokenSource>): ResolvedPush =
        ResolvedPush(source.orElse(NoPushTokens))

    @Provides
    @Singleton
    fun socketTransport(client: OkHttpClient): SocketTransport = OkHttpTransport(client)

    @Provides
    @Singleton
    fun clientFactory(
        @ApplicationScope scope: CoroutineScope,
        clock: Clock,
        transport: SocketTransport,
        tailnet: ResolvedTailnet,
        credentials: CredentialStore
    ): LpmClientFactory = LpmClientFactory(
        // Posts rather than running inline, like `DispatchQueue.main.async`.
        ClientEnvironment(
            CoroutineScope(scope.coroutineContext + Dispatchers.Main),
            clock,
            transport,
            tailnet.router,
            phoneId = { credentials.phoneId }
        )
    )

    @Provides
    @Singleton
    fun hostProber(client: OkHttpClient, tailnet: ResolvedTailnet): HostProber =
        OkHttpHostProber(client, tailnet.router)

    @Provides
    @Singleton
    fun networkMonitor(
        @ApplicationContext context: Context,
        @ApplicationScope scope: CoroutineScope
    ): NetworkMonitor = ConnectivityNetworkMonitor(context, scope)

    /** Unscoped: every owner browses on its own and stops when it's done. */
    @Provides
    fun macBrowser(
        @ApplicationContext context: Context,
        @ApplicationScope scope: CoroutineScope
    ): MacBrowser = NsdMacBrowser(context, scope)

    @Provides
    @Singleton
    fun projectSnapshots(
        @ApplicationContext context: Context,
        @ApplicationScope scope: CoroutineScope,
        clock: Clock
    ): ProjectSnapshots =
        ProjectSnapshots(File(context.cacheDir, "project-lists"), scope, Dispatchers.IO, clock)

    @Provides
    @Singleton
    fun macUnpair(
        @ApplicationScope scope: CoroutineScope,
        transport: SocketTransport,
        tailnet: ResolvedTailnet,
        credentials: CredentialStore,
        clock: Clock
    ): MacUnpair = MacUnpair(scope, transport, tailnet.router, credentials, clock)

    @Provides
    @Singleton
    fun sessionEnvironment(
        @ApplicationScope scope: CoroutineScope,
        clock: Clock,
        prefs: AppPreferences,
        macStore: MacStore,
        credentials: CredentialStore,
        snapshots: ProjectSnapshots,
        network: NetworkMonitor,
        browsers: Provider<MacBrowser>,
        prober: HostProber,
        clients: LpmClientFactory,
        device: ThisDevice,
        tailnet: ResolvedTailnet,
        unpair: MacUnpair,
        storeFactories: Set<@JvmSuppressWildcards SessionStore.Factory>
    ): SessionEnvironment = SessionEnvironment(
        scope = scope,
        clock = clock,
        prefs = prefs,
        macStore = macStore,
        credentials = credentials,
        snapshots = snapshots,
        network = network,
        newBrowser = browsers::get,
        prober = prober,
        clients = clients,
        device = device,
        tailnet = tailnet.router,
        unpair = unpair,
        storeFactories = storeFactories
    )

    /** The live session; a machine visit builds its own beside it. */
    @Provides
    @Singleton
    fun macSession(env: SessionEnvironment): MacSession = MacSession(env, visitHost = null)

    @Provides
    @IntoSet
    fun projectsStoreFactory(): SessionStore.Factory = SessionStore.Factory(::ProjectsStore)

    @Provides
    @IntoSet
    fun terminalsStoreFactory(): SessionStore.Factory = SessionStore.Factory(::TerminalsStore)

    @Provides
    @IntoSet
    fun gitAutoStoreFactory(): SessionStore.Factory = SessionStore.Factory(::GitAutoStore)

    @Provides
    @IntoSet
    fun lpmCommandsStoreFactory(): SessionStore.Factory = SessionStore.Factory(::LpmCommandsStore)

    @Provides
    @IntoSet
    fun automationsStoreFactory(): SessionStore.Factory = SessionStore.Factory(::AutomationsStore)

    @Provides
    @IntoSet
    fun gitStoreFactory(): SessionStore.Factory = SessionStore.Factory(::GitStore)

    @Provides
    @IntoSet
    fun gitHistoryStoreFactory(): SessionStore.Factory = SessionStore.Factory(::GitHistoryStore)

    @Provides
    @IntoSet
    fun serviceLogsStoreFactory(): SessionStore.Factory = SessionStore.Factory(::ServiceLogsStore)

    @Provides
    @IntoSet
    fun projectConfigStoreFactory(): SessionStore.Factory =
        SessionStore.Factory(::ProjectConfigStore)

    @Provides
    @IntoSet
    fun actionsStoreFactory(): SessionStore.Factory = SessionStore.Factory(::ActionsStore)

    @Provides
    @IntoSet
    fun usageStoreFactory(): SessionStore.Factory = SessionStore.Factory(::UsageStore)

    @Provides
    @IntoSet
    fun statsStoreFactory(): SessionStore.Factory = SessionStore.Factory(::StatsStore)

    @Provides
    @IntoSet
    fun weeklyRecapStoreFactory(): SessionStore.Factory = SessionStore.Factory(::WeeklyRecapStore)

    @Provides
    @IntoSet
    fun claudeAccountsStoreFactory(): SessionStore.Factory =
        SessionStore.Factory(::ClaudeAccountsStore)

    @Provides
    @IntoSet
    fun machineImporterFactory(): SessionStore.Factory = SessionStore.Factory(::MachineImporter)

    @Provides
    @IntoSet
    fun agentLaunchStoreFactory(): SessionStore.Factory = SessionStore.Factory(::AgentLaunchStore)

    @Provides
    @IntoSet
    fun projectFilesStoreFactory(): SessionStore.Factory = SessionStore.Factory(::ProjectFilesStore)

    @Provides
    @IntoSet
    fun pushStoreFactory(
        registrar: Provider<PushRegistrar>,
        answers: Provider<AgentAnswers>
    ): SessionStore.Factory = SessionStore.Factory { PushStore(it, registrar.get(), answers.get()) }

    /**
     * The live session's stores, for app-level code (root, settings). Screens resolve
     * theirs from [cx.lpm.mobile.core.data.session.MacSessions] by their key's session.
     */
    @Provides
    fun projectsStore(session: MacSession): ProjectsStore = session.store()

    @Provides
    fun terminalsStore(session: MacSession): TerminalsStore = session.store()

    private fun ioScope() = CoroutineScope(Dispatchers.IO + SupervisorJob())
}

@Module
@InstallIn(SingletonComponent::class)
interface DataBindings {
    /** Bound by `:core:tailnet`; until then every address is dialed directly. */
    @BindsOptionalOf
    fun tailnetRouter(): TailnetRouter

    /** Bound by `:core:push`; until then no Mac is asked to push. */
    @BindsOptionalOf
    fun pushTokenSource(): PushTokenSource

    @Binds
    fun secretCipher(impl: KeystoreCipher): SecretCipher

    @Multibinds
    fun storeFactories(): Set<SessionStore.Factory>
}

/** The bound [TailnetRouter], or [NoTailnet] until `:core:tailnet` provides one. */
class ResolvedTailnet(val router: TailnetRouter)

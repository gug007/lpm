package cx.lpm.mobile

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.LifecycleStartEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.navigation3.rememberViewModelStoreNavEntryDecorator
import androidx.navigation3.runtime.EntryProviderScope
import androidx.navigation3.runtime.NavEntry
import androidx.navigation3.runtime.NavKey
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.runtime.rememberSaveableStateHolderNavEntryDecorator
import androidx.navigation3.ui.NavDisplay
import cx.lpm.mobile.core.data.push.NotificationOpens
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.navigation.Navigator
import cx.lpm.mobile.core.navigation.PairingKey
import cx.lpm.mobile.core.navigation.ProjectsKey
import cx.lpm.mobile.core.web.TerminalWebPool
import cx.lpm.mobile.feature.actions.actionsEntries
import cx.lpm.mobile.feature.activity.activityEntries
import cx.lpm.mobile.feature.automations.automationsEntries
import cx.lpm.mobile.feature.config.configEntries
import cx.lpm.mobile.feature.connection.ConnectionSheets
import cx.lpm.mobile.feature.connection.ConnectionStatusBarRoute
import cx.lpm.mobile.feature.connection.IssueCardRoute
import cx.lpm.mobile.feature.connection.TerminalConnectionBannerRoute
import cx.lpm.mobile.feature.files.filesEntries
import cx.lpm.mobile.feature.git.gitEntries
import cx.lpm.mobile.feature.mac.keepawake.KeepAwakeCustomTimeRoute
import cx.lpm.mobile.feature.mac.keepawake.KeepAwakeSectionRoute
import cx.lpm.mobile.feature.mac.update.MacUpdateSectionRoute
import cx.lpm.mobile.feature.memory.memoryEntries
import cx.lpm.mobile.feature.notes.notesEntries
import cx.lpm.mobile.feature.pairing.AddMacSheetHost
import cx.lpm.mobile.feature.pairing.IssueCardSlot
import cx.lpm.mobile.feature.pairing.pairingEntries
import cx.lpm.mobile.feature.projects.ProjectsSlots
import cx.lpm.mobile.feature.projects.duplicate.DuplicateProjectSheet
import cx.lpm.mobile.feature.projects.menu.ProjectMenuToolbar
import cx.lpm.mobile.feature.projects.projectsEntries
import cx.lpm.mobile.feature.projects.ui.SessionAlertsHost
import cx.lpm.mobile.feature.settings.settingsEntries
import cx.lpm.mobile.feature.terminal.TerminalSlots
import cx.lpm.mobile.feature.terminal.settings.TerminalSettingsSheet
import cx.lpm.mobile.feature.terminal.terminalEntries
import cx.lpm.mobile.feature.usage.usageEntries
import kotlinx.coroutines.flow.StateFlow

/**
 * iOS `ContentView`: pairing until a Mac is saved, then the projects list, with the
 * connection sheets over both and "Add a machine" over the projects list.
 */
@Composable
fun LpmApp(
    session: MacSession,
    tailnetState: StateFlow<String>,
    opens: NotificationOpens,
    modifier: Modifier = Modifier
) {
    val state by session.state.collectAsStateWithLifecycle()
    LaunchedEffect(session, tailnetState) { tailnetState.collect(session::tailnetChanged) }
    var backgrounded by rememberSaveable { mutableStateOf(false) }
    LifecycleStartEffect(session) {
        if (backgrounded) {
            session.setInForeground(true)
            session.reconnectIfNeeded()
        }
        onStopOrDispose {
            backgrounded = true
            session.setInForeground(false)
            session.suspendRecoveryDiscovery()
        }
    }
    if (state.macs.isEmpty()) {
        RootStack(root = PairingKey, modifier = modifier) { pairingEntries(it, pairingIssueCard) }
        // A Mac that removed this phone leaves it here, saying so.
        val alerts by session.alerts.alerts.collectAsStateWithLifecycle()
        SessionAlertsHost(
            alerts = alerts,
            onDismissError = session.alerts::dismissError,
            onDismissNotice = session.alerts::dismissNotice
        )
    } else {
        // Warm the terminal WebView once a terminal is a tap away, not during launch:
        // creating the first WebView costs the main thread a second or more.
        val context = LocalContext.current
        LaunchedEffect(Unit) { TerminalWebPool.prewarm(context) }
        LocalNetworkRequest(session)
        RootStack(
            root = ProjectsKey,
            modifier = modifier,
            overlay = { navigator ->
                VisitHost(session, navigator)
                NotificationOpenHost(session, opens, navigator)
            }
        ) { navigator ->
            val projects = projectsSlots(navigator)
            projectsEntries(navigator, projects)
            terminalEntries(navigator, terminalSlots(navigator, projects))
            usageEntries(navigator)
            actionsEntries(navigator)
            automationsEntries(navigator, automationsSlots(navigator))
            gitEntries(navigator)
            filesEntries(navigator)
            activityEntries(navigator, connectionStatusBar = { ConnectionStatusBarRoute() })
            settingsEntries(navigator, settingsSlots)
            notesEntries(navigator)
            memoryEntries(navigator)
            configEntries(navigator, configSlots)
        }
        AddMacSheetHost(pairingIssueCard)
    }
    ConnectionSheets(
        macUpdateSection = { MacUpdateSectionRoute() },
        keepAwakeSection = { openCustomTime ->
            KeepAwakeSectionRoute(onCustomTime = openCustomTime)
        },
        keepAwakeCustomTime = { onDone -> KeepAwakeCustomTimeRoute(onDone = onDone) }
    )
}

@Composable
private fun RootStack(
    root: NavKey,
    modifier: Modifier = Modifier,
    overlay: @Composable (Navigator) -> Unit = {},
    entries: EntryProviderScope<NavKey>.(Navigator) -> Unit
) {
    val backStack = rememberNavBackStack(root)
    val navigator = remember(backStack) { Navigator(backStack) }
    val sheets = remember { SheetSceneStrategy<NavKey>() }
    NavDisplay(
        backStack = backStack,
        modifier = modifier,
        onBack = navigator::back,
        sceneStrategies = listOf(sheets),
        entryDecorators = listOf(
            rememberSaveableStateHolderNavEntryDecorator(),
            rememberViewModelStoreNavEntryDecorator()
        ),
        entryProvider = entryProvider(
            fallback = { key ->
                NavEntry(key) { UnportedScreen(title = key.toString(), onBack = navigator::back) }
            }
        ) { entries(navigator) }
    )
    overlay(navigator)
}

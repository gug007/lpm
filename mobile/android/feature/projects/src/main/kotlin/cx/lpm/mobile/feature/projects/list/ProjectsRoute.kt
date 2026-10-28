package cx.lpm.mobile.feature.projects.list

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation3.runtime.NavKey
import cx.lpm.mobile.core.navigation.ActivityKey
import cx.lpm.mobile.core.navigation.AddProjectKey
import cx.lpm.mobile.core.navigation.AutomationsKey
import cx.lpm.mobile.core.navigation.ProjectKey
import cx.lpm.mobile.core.navigation.SettingsKey
import cx.lpm.mobile.core.navigation.StatsKey
import cx.lpm.mobile.core.navigation.TerminalKey
import cx.lpm.mobile.core.navigation.UsageKey
import cx.lpm.mobile.feature.projects.ProjectsSlots
import cx.lpm.mobile.feature.projects.ui.LightStatusBarIcons
import cx.lpm.mobile.feature.projects.ui.SessionAlertsHost
import cx.lpm.mobile.feature.projects.visit.destination
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** The projects list root, wired to its ViewModel, navigation and dialogs. */
@Composable
fun ProjectsRoute(
    onNavigate: (NavKey) -> Unit,
    modifier: Modifier = Modifier,
    slots: ProjectsSlots = ProjectsSlots(),
    viewModel: ProjectsViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val alerts by viewModel.alerts.collectAsStateWithLifecycle()
    val removal by viewModel.removal.collectAsStateWithLifecycle()
    var dialog by remember { mutableStateOf<ProjectsDialog?>(null) }
    var refreshing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    fun tap() = haptics.performHapticFeedback(HapticFeedbackType.ContextClick)

    // Whatever was opened on another machine is off screen once the list is back.
    LaunchedEffect(Unit) { viewModel.leaveVisit() }
    // With several machines saved, keep the switcher's "is it there?" fresh.
    val manyMacs = state.macs.size > 1
    LaunchedEffect(manyMacs) {
        while (manyMacs) {
            viewModel.refreshReach()
            delay(REACH_REFRESH_MS)
        }
    }
    LightStatusBarIcons(light = state.demoMode)

    ProjectsScreen(
        state = state,
        refreshing = refreshing,
        onRefresh = {
            scope.launch {
                refreshing = true
                viewModel.refresh()
                refreshing = false
            }
        },
        onExitDemo = viewModel::exitDemo,
        modifier = modifier,
        menuActions = ProjectsMenuActions(
            activity = { onNavigate(ActivityKey) },
            automations = { onNavigate(AutomationsKey()) },
            stats = { onNavigate(StatsKey()) },
            usage = { onNavigate(UsageKey()) },
            settings = { onNavigate(SettingsKey) },
            addProject = { onNavigate(AddProjectKey) },
            newFolder = { dialog = ProjectsDialog.NewFolder },
            updateItem = slots.macUpdateMenuItem,
            pairDirectlyItems = slots.pairDirectlyMenuItems
        ),
        macActions = MacSwitcherActions(
            exitDemo = viewModel::exitDemo,
            switchTo = viewModel::switchTo,
            addMachine = viewModel::addMachine,
            manageMachines = viewModel::manageMachines,
            showDetails = viewModel::showConnectionDetails,
            pendingMachines = slots.pendingMachines
        ),
        rowActions = ProjectRowActions(
            open = { onNavigate(ProjectKey(it.name)) },
            start = viewModel::start,
            pickStatus = { project, choice ->
                if (choice != null && choice.asksNote) {
                    dialog = ProjectsDialog.WorkStatusNote(project, choice)
                } else {
                    viewModel.setWorkStatus(project.name, choice?.input)
                }
            },
            move = viewModel::moveToFolder,
            newFolderFor = { dialog = ProjectsDialog.NewFolderFor(it) },
            duplicate = { dialog = ProjectsDialog.Duplicate(it) },
            remove = {
                viewModel.checkRemoval(it)
                dialog = ProjectsDialog.RemoveDuplicate(it)
            },
            openTerminal = { project, id -> onNavigate(TerminalKey(project.name, id)) },
            toggleSeenAgents = viewModel::toggleSeenAgents,
            archiveAgent = { project, row ->
                tap()
                viewModel.archiveAgent(project, row)
            },
            markAgentSeen = { project, row ->
                tap()
                viewModel.markAgentSeen(project, row)
            },
            markAgentUnread = { project, row ->
                tap()
                viewModel.markAgentUnread(project, row)
            },
            cancelQueued = viewModel::cancelQueued,
            retryQueued = viewModel::retryQueued
        ),
        folderActions = FolderActions(
            toggle = viewModel::toggleFolder,
            rename = { dialog = ProjectsDialog.RenameFolder(it) },
            delete = { dialog = ProjectsDialog.DeleteFolder(it) }
        ),
        machineActions = MachineActions(
            toggle = viewModel::toggleMachine,
            switchTo = viewModel::switchToMachine,
            open = { slug, project ->
                viewModel.visit(slug, project)?.let { onNavigate(it.destination) }
            },
            openTerminal = { slug, project, terminal ->
                viewModel.visit(slug, project, terminal)?.let { onNavigate(it.destination) }
            }
        ),
        onUndoArchive = {
            tap()
            viewModel.undoArchive()
        },
        slots = slots
    )

    ProjectsDialogHost(
        dialog = dialog,
        duplicateDefaults = state.duplicateDefaults,
        removal = removal,
        actions = ProjectsDialogActions(
            createFolder = viewModel::createFolder,
            moveToFolder = viewModel::moveToFolder,
            renameFolder = viewModel::renameFolder,
            deleteFolder = viewModel::deleteFolder,
            remove = viewModel::remove,
            duplicate = viewModel::duplicate,
            setWorkStatus = viewModel::setWorkStatus
        ),
        onDismiss = {
            if (dialog is ProjectsDialog.RemoveDuplicate) viewModel.endRemovalCheck()
            dialog = null
        }
    )
    SessionAlertsHost(
        alerts = alerts,
        onDismissError = viewModel::dismissError,
        onDismissNotice = viewModel::dismissNotice
    )
}

private const val REACH_REFRESH_MS = 60_000L

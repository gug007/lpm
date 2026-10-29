package cx.lpm.mobile.feature.projects.menu

import android.content.ClipData
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation3.runtime.NavKey
import cx.lpm.mobile.core.designsystem.R
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ActivityIndicatorSize
import cx.lpm.mobile.core.designsystem.component.ContextMenu
import cx.lpm.mobile.core.designsystem.component.GlassButtonGroup
import cx.lpm.mobile.core.designsystem.component.GlassGroupButton
import cx.lpm.mobile.core.designsystem.component.GlassIconButton
import cx.lpm.mobile.core.designsystem.component.LocalConfirmRisky
import cx.lpm.mobile.core.designsystem.component.stopProject
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.core.navigation.AutomationsKey
import cx.lpm.mobile.core.navigation.GitAutoKey
import cx.lpm.mobile.core.navigation.GitBranchKey
import cx.lpm.mobile.core.navigation.GitPullRequestKey
import cx.lpm.mobile.core.navigation.GitReviewKey
import cx.lpm.mobile.core.navigation.MemoryKey
import cx.lpm.mobile.core.navigation.NotesKey
import cx.lpm.mobile.core.navigation.ProjectActionsKey
import cx.lpm.mobile.core.navigation.ProjectConfigKey
import cx.lpm.mobile.core.navigation.ProjectFilesKey
import cx.lpm.mobile.feature.projects.ProjectsSlots
import cx.lpm.mobile.feature.projects.R as ProjectsR
import cx.lpm.mobile.feature.projects.resume.ResumeSessionSheet
import kotlinx.coroutines.launch

/**
 * A project's toolbar buttons on any of its screens (iOS `projectMenuToolbar`): ⚡
 * for its actions when it has some, and the "…" menu (green while it runs, a
 * spinner while a Start/Stop is out), plus everything that menu opens. On a
 * terminal's screen ([terminal]) its Rename names that tab. [onSpawnedTerminal] is
 * told about a terminal an action run spawns.
 */
@Composable
fun ProjectMenuToolbar(
    project: String,
    session: SessionKey,
    onNavigate: (NavKey) -> Unit,
    modifier: Modifier = Modifier,
    terminal: TerminalInfo? = null,
    onSpawnedTerminal: (TerminalInfo) -> Unit = {},
    slots: ProjectsSlots = ProjectsSlots(),
    viewModel: ProjectMenuViewModel =
        hiltViewModel<ProjectMenuViewModel, ProjectMenuViewModel.Factory>(
            key = "project-menu:$session:$project",
            creationCallback = { it.create(project, session) }
        )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    LaunchedEffect(project) { viewModel.onAppear() }
    val live = state.project ?: return
    var menuOpen by remember { mutableStateOf(false) }
    var dialog by remember { mutableStateOf<MenuDialog?>(null) }
    var resumeOpen by remember { mutableStateOf(false) }
    val clipboard = LocalClipboard.current
    val scope = rememberCoroutineScope()
    val confirmRisky = LocalConfirmRisky.current
    val actions = ProjectMenuActions(
        start = viewModel::start,
        stop = { confirmRisky.stopProject(project) { viewModel.stop() } },
        reviewChanges = { onNavigate(GitReviewKey(project, session)) },
        files = if (state.canBrowseFiles) {
            { onNavigate(ProjectFilesKey(project, session = session)) }
        } else {
            null
        },
        resumeSession = if (state.canResumeSessions) {
            { resumeOpen = true }
        } else {
            null
        },
        memory = { onNavigate(MemoryKey(project, session)) },
        notes = { onNavigate(NotesKey(project, session)) },
        automations = { onNavigate(AutomationsKey(project, session)) },
        pickStatus = { choice ->
            if (choice != null && choice.asksNote) {
                dialog = MenuDialog.StatusNote(choice)
            } else {
                viewModel.setWorkStatus(choice?.input)
            }
        },
        rename = { dialog = terminal?.let(MenuDialog::RenameTab) ?: MenuDialog.Rename },
        configure = { onNavigate(ProjectConfigKey(project, session)) },
        terminalSettings = { dialog = MenuDialog.TerminalSettings },
        git = GitMenuActions(
            pull = viewModel::pull,
            push = { confirmRisky.confirm("Push $project") { viewModel.push() } },
            fetch = viewModel::fetch,
            setAutoPull = viewModel::setAutoPull,
            undoAutoPull = viewModel::undoAutoPull,
            switchBranch = { onNavigate(GitBranchKey(project, session)) },
            createPullRequest = { onNavigate(GitPullRequestKey(project, session)) },
            auto = { onNavigate(GitAutoKey(project, it.rawValue, session)) },
            copyBranch = {
                val branch = state.branch
                scope.launch {
                    clipboard.setClipEntry(ClipEntry(ClipData.newPlainText(branch, branch)))
                }
            },
            discard = { dialog = MenuDialog.Discard }
        ),
        claudeAccount = { slots.claudeAccountMenu(this, session, live) }
    )
    Box(modifier) {
        MenuButtons(
            project = live,
            pending = state.pending,
            onActions = { onNavigate(ProjectActionsKey(project, session)) },
            onMore = { menuOpen = true }
        )
        ContextMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
            ProjectMenuItems(state, live, actions, renamesTab = terminal != null)
        }
        GitNoticeBanner(state.notice, Modifier.align(Alignment.BottomCenter))
    }
    ProjectMenuDialogs(
        dialog = dialog,
        state = state,
        project = live,
        onRename = viewModel::rename,
        onRenameTab = { term, name -> viewModel.renameTab(term.id, name) },
        onDiscard = {
            confirmRisky.confirm("Discard every change in $project") { viewModel.discardAll() }
        },
        onStatus = viewModel::setWorkStatus,
        onDismissOpError = viewModel::dismissOpError,
        terminalSettings = slots.terminalSettingsSheet,
        onDismiss = { dialog = null }
    )
    if (resumeOpen) {
        ResumeSessionSheet(
            project = project,
            session = session,
            onOpen = onSpawnedTerminal,
            onDismiss = { resumeOpen = false }
        )
    }
    slots.claudeConsentPrompt(session, project)
    slots.actionRunner(session, project, onSpawnedTerminal)
}

/** The ⚡ and "…" buttons, sharing one glass capsule when both show. */
@Composable
private fun MenuButtons(
    project: Project,
    pending: Boolean,
    onActions: () -> Unit,
    onMore: () -> Unit,
    modifier: Modifier = Modifier
) {
    val more = stringResource(ProjectsR.string.projects_more)
    val tint = if (project.running) LpmTheme.colors.green else LpmTheme.colors.label
    if (project.actions.isEmpty()) {
        if (pending) {
            Box(modifier.size(44.dp), contentAlignment = Alignment.Center) {
                ActivityIndicator(size = ActivityIndicatorSize.Small)
            }
        } else {
            GlassIconButton(
                icon = painterResource(R.drawable.ic_more_horiz),
                contentDescription = more,
                onClick = onMore,
                tint = tint,
                iconSize = 28.dp,
                modifier = modifier
            )
        }
        return
    }
    GlassButtonGroup(modifier) {
        GlassGroupButton(
            icon = painterResource(R.drawable.ic_bolt),
            contentDescription = stringResource(ProjectsR.string.menu_actions),
            onClick = onActions,
            iconSize = 28.dp
        )
        if (pending) {
            Box(Modifier.size(44.dp), contentAlignment = Alignment.Center) {
                ActivityIndicator(size = ActivityIndicatorSize.Small)
            }
        } else {
            GlassGroupButton(
                icon = painterResource(R.drawable.ic_more_horiz),
                contentDescription = more,
                onClick = onMore,
                tint = tint,
                iconSize = 28.dp
            )
        }
    }
}

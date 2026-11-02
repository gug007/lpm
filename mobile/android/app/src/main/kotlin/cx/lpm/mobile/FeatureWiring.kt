package cx.lpm.mobile

import androidx.compose.ui.res.stringResource
import cx.lpm.mobile.core.navigation.FilePreviewKey
import cx.lpm.mobile.core.navigation.Navigator
import cx.lpm.mobile.feature.actions.editor.ActionEditorSheet
import cx.lpm.mobile.feature.actions.run.ActionInputsSheet
import cx.lpm.mobile.feature.actions.run.ActionRunHost
import cx.lpm.mobile.feature.actions.run.BackgroundRunsSection
import cx.lpm.mobile.feature.automations.AutomationsSlots
import cx.lpm.mobile.feature.claudeaccount.ClaudeAccountMenuRoute
import cx.lpm.mobile.feature.claudeaccount.ClaudeConsentPromptRoute
import cx.lpm.mobile.feature.claudeaccount.TabClaudeAccountMenuRoute
import cx.lpm.mobile.feature.config.ConfigSlots
import cx.lpm.mobile.feature.connection.ConnectionStatusBarRoute
import cx.lpm.mobile.feature.connection.IssueCardRoute
import cx.lpm.mobile.feature.connection.TailnetSettingsPage
import cx.lpm.mobile.feature.connection.TerminalConnectionBannerRoute
import cx.lpm.mobile.feature.mac.keepawake.KeepAwakeIndicatorRoute
import cx.lpm.mobile.feature.mac.keepawake.KeepAwakeMenuRoute
import cx.lpm.mobile.feature.mac.machines.PairDirectlyRoute
import cx.lpm.mobile.feature.mac.machines.PendingMachinesRoute
import cx.lpm.mobile.feature.mac.update.MacUpdateBarRoute
import cx.lpm.mobile.feature.mac.update.MacUpdateMenuItemRoute
import cx.lpm.mobile.feature.memory.composer.ComposerMemorySheet
import cx.lpm.mobile.feature.pairing.IssueCardSlot
import cx.lpm.mobile.feature.projects.ProjectsSlots
import cx.lpm.mobile.feature.projects.duplicate.DuplicateProjectSheet
import cx.lpm.mobile.feature.projects.menu.ProjectMenuToolbar
import cx.lpm.mobile.feature.projects.services.ServiceEditorSheet
import cx.lpm.mobile.feature.settings.SettingsPage
import cx.lpm.mobile.feature.settings.SettingsSlots
import cx.lpm.mobile.feature.speech.R as SpeechR
import cx.lpm.mobile.feature.speech.settings.SpeechSettings
import cx.lpm.mobile.feature.speech.ui.ReadAloudButton
import cx.lpm.mobile.feature.speech.ui.SpeechBarRoute
import cx.lpm.mobile.feature.speech.ui.speakingBlockOf
import cx.lpm.mobile.feature.terminal.TerminalSlots
import cx.lpm.mobile.feature.terminal.composer.ComposerTarget
import cx.lpm.mobile.feature.terminal.composer.FollowupComposer
import cx.lpm.mobile.feature.terminal.settings.TerminalSettingsControls
import cx.lpm.mobile.feature.terminal.settings.TerminalSettingsSheet
import cx.lpm.mobile.feature.usage.rows.UsageRowsRoute

// Features never depend on each other: each exposes slots, and the app fills them
// with the other features' UI here.

/** The connection feature's issue card, on the pairing screens. */
internal val pairingIssueCard: IssueCardSlot = { issue, handle ->
    IssueCardRoute(issue, handle = handle)
}

internal fun projectsSlots(navigator: Navigator) = ProjectsSlots(
    connectionStatusBar = { session -> ConnectionStatusBarRoute(session = session) },
    issueCard = { issue -> IssueCardRoute(issue) },
    usage = { UsageRowsRoute(onNavigate = navigator::navigate) },
    projectUsage = { session, project ->
        UsageRowsRoute(onNavigate = navigator::navigate, session = session, project = project)
    },
    backgroundRuns = { session, project -> BackgroundRunsSection(session, project) },
    actionRunner = { session, project, onSpawned -> ActionRunHost(project, session, onSpawned) },
    actionInputs = { action, onSubmit, onDismiss ->
        ActionInputsSheet(action, onSubmit, onDismiss)
    },
    claudeAccountMenu = { session, project -> ClaudeAccountMenuRoute(session, project.name) },
    tabClaudeAccountMenu = { session, term, working ->
        TabClaudeAccountMenuRoute(session, term, working)
    },
    claudeConsentPrompt = { session, project -> ClaudeConsentPromptRoute(session, project) },
    macUpdateMenuItem = { MacUpdateMenuItemRoute() },
    pairDirectlyMenuItems = { PairDirectlyRoute() },
    pendingMachines = { PendingMachinesRoute() },
    keepAwakeMenu = { KeepAwakeMenuRoute() },
    keepAwakeIndicator = { KeepAwakeIndicatorRoute() },
    terminalSettingsSheet = { onDismiss -> TerminalSettingsSheet(onDismiss) },
    bottomBar = { MacUpdateBarRoute() }
)

internal fun terminalSlots(navigator: Navigator, projects: ProjectsSlots) = TerminalSlots(
    projectMenu = { project, terminal, session, onSpawned ->
        ProjectMenuToolbar(
            project = project.name,
            session = session,
            onNavigate = navigator::navigate,
            terminal = terminal,
            onSpawnedTerminal = onSpawned,
            slots = projects
        )
    },
    connectionBanner = { session -> TerminalConnectionBannerRoute(session = session) },
    memorySheet = { project, cli, onInvocation, onDismiss ->
        ComposerMemorySheet(
            project = project,
            cli = cli,
            onInvocation = onInvocation,
            onDismiss = onDismiss
        )
    },
    duplicateSheet = { project, prompt, copies, onDuplicated, onDismiss ->
        DuplicateProjectSheet(
            project = project,
            onDismiss = onDismiss,
            seedPrompt = prompt,
            seedCount = copies,
            onDuplicate = onDuplicated
        )
    }
)

internal fun automationsSlots(navigator: Navigator) = AutomationsSlots(
    readAloudButton = { message ->
        ReadAloudButton(
            sourceId = message.sourceId,
            title = message.title,
            subtitle = message.subtitle,
            markdown = message.markdown,
            session = message.session
        )
    },
    speechBar = { SpeechBarRoute() },
    speakingBlock = { sourceId -> speakingBlockOf(sourceId) },
    followupComposer = { reply ->
        FollowupComposer(
            target = ComposerTarget(reply.composerId, reply.project, reply.label, reply.session),
            disabled = reply.disabled,
            placeholder = reply.placeholder,
            onSend = reply.onSend,
            onPreviewFile = { path ->
                navigator.navigate(
                    FilePreviewKey(reply.project, listOf(path), session = reply.session)
                )
            }
        )
    }
)

internal val settingsSlots = SettingsSlots(
    tailscalePage = { onBack -> TailnetSettingsPage(onBack = onBack) },
    terminalControls = { TerminalSettingsControls() },
    readAloudPage = { onBack ->
        SettingsPage(stringResource(SpeechR.string.speech_title), onBack) { SpeechSettings() }
    }
)

internal val configSlots = ConfigSlots(
    serviceEditor = { project, key, session, onDismiss ->
        ServiceEditorSheet(project, key, session, onDismiss)
    },
    actionEditor = { project, key, session, onDismiss ->
        ActionEditorSheet(project, key, session, onDismiss)
    }
)

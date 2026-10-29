package cx.lpm.mobile.core.data.client

import cx.lpm.mobile.core.model.ActionBgOutput
import cx.lpm.mobile.core.model.AgentOption
import cx.lpm.mobile.core.model.AgentSessionsPage
import cx.lpm.mobile.core.model.AgentStats
import cx.lpm.mobile.core.model.AutoPullMode
import cx.lpm.mobile.core.model.AutomationHistoryEntry
import cx.lpm.mobile.core.model.AutomationJob
import cx.lpm.mobile.core.model.AutomationLiveOutput
import cx.lpm.mobile.core.model.AutomationMachine
import cx.lpm.mobile.core.model.BackgroundRunSummary
import cx.lpm.mobile.core.model.ClaudeAccounts
import cx.lpm.mobile.core.model.ComposerAction
import cx.lpm.mobile.core.model.ControlOwner
import cx.lpm.mobile.core.model.CustomWorkStatus
import cx.lpm.mobile.core.model.DirListing
import cx.lpm.mobile.core.model.FileChunk
import cx.lpm.mobile.core.model.GitAutoRun
import cx.lpm.mobile.core.model.GitBranch
import cx.lpm.mobile.core.model.GitDiffEntry
import cx.lpm.mobile.core.model.GitDiffResult
import cx.lpm.mobile.core.model.GitSnapshot
import cx.lpm.mobile.core.model.HistoryFolder
import cx.lpm.mobile.core.model.HistoryItem
import cx.lpm.mobile.core.model.HistoryRow
import cx.lpm.mobile.core.model.LimitsSnapshot
import cx.lpm.mobile.core.model.MacBuild
import cx.lpm.mobile.core.model.MacUpdateCheck
import cx.lpm.mobile.core.model.MacUpdateStep
import cx.lpm.mobile.core.model.MachinePairOffer
import cx.lpm.mobile.core.model.MemoryList
import cx.lpm.mobile.core.model.MemorySession
import cx.lpm.mobile.core.model.MentionEntry
import cx.lpm.mobile.core.model.NoteChat
import cx.lpm.mobile.core.model.NoteMessage
import cx.lpm.mobile.core.model.NoteSearchHit
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.model.ProjectDirContents
import cx.lpm.mobile.core.model.ProjectFolder
import cx.lpm.mobile.core.model.RemoteMachine
import cx.lpm.mobile.core.model.ServiceInfo
import cx.lpm.mobile.core.model.SlashCommand
import cx.lpm.mobile.core.model.SshHostInfo
import cx.lpm.mobile.core.model.StatusEntry
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.core.model.UploadStep
import cx.lpm.mobile.core.model.WeeklyRecap
import java.time.Instant
import kotlinx.serialization.json.JsonObject

/**
 * Where [LpmClient] hands what the Mac said, one callback per frame kind, always on
 * the main thread. Each session store assigns the ones its area owns in
 * `SessionStore.wire`; replies to requests carry `error` null on success.
 */
@Suppress("ktlint:standard:max-line-length")
abstract class LpmClientCallbacks {
    var onState: ((LpmClient.State) -> Unit)? = null
    var onOutput: ((id: String, data: String) -> Unit)? = null
    var onSeed: ((id: String, cols: Int, rows: Int, data: String, reset: Boolean) -> Unit)? = null
    var onControl: ((id: String, owner: ControlOwner?) -> Unit)? = null
    var onExit: ((id: String, code: Int, gone: Boolean) -> Unit)? = null
    var onProjects: ((List<Project>) -> Unit)? = null

    // The Mac's work-status palette and auto pull setting, with every projects reply.
    var onWorkStatusPalette: (
        (
            statuses: List<CustomWorkStatus>,
            order: List<String>
        ) -> Unit
    )? = null
    var onAutoPullMode: ((AutoPullMode) -> Unit)? = null

    // How many seen agents a project lists before folding the rest, also with every
    // projects reply.
    var onSeenAgentsShown: ((Int) -> Unit)? = null

    // Whether the Mac keeps finished agents as seen once opened, likewise.
    var onKeepFinishedAgents: ((Boolean) -> Unit)? = null
    var onSidebar: ((order: List<String>, groups: List<ProjectFolder>) -> Unit)? = null
    var onStats: ((stats: AgentStats?, error: String?) -> Unit)? = null
    var onLimits: ((snapshot: LimitsSnapshot?, error: String?) -> Unit)? = null
    var onWeeklyRecap: (
        (week: String, period: String, recap: WeeklyRecap?, error: String?) -> Unit
    )? = null
    var onLimitsChanged: ((snapshot: LimitsSnapshot) -> Unit)? = null
    var onSpeech: ((reqId: String, audio: String?, error: String?) -> Unit)? = null
    var onTerminals: ((project: String, terminals: List<TerminalInfo>) -> Unit)? = null
    var onSlash: ((id: String, commands: List<SlashCommand>) -> Unit)? = null
    var onUpload: ((id: String, reqId: String, path: String) -> Unit)? = null
    var onUploadStep: ((UploadStep) -> Unit)? = null
    var onMentions: ((project: String, entries: List<MentionEntry>) -> Unit)? = null
    var onHistory: ((project: String, rows: List<HistoryRow>) -> Unit)? = null
    var onStatus: (
        (project: String, entries: List<StatusEntry>, seen: List<StatusEntry>) -> Unit
    )? = null
    var onJobs: (
        (jobs: List<AutomationJob>, machines: List<AutomationMachine>, error: String?) -> Unit
    )? = null
    var onJobHistory: (
        (
            project: String,
            jobId: String,
            entries: List<AutomationHistoryEntry>,
            error: String?
        ) -> Unit
    )? = null
    var onJobLiveOutput: (
        (project: String, jobId: String, live: AutomationLiveOutput?, error: String?) -> Unit
    )? = null
    var onAutomationMutation: ((project: String, jobId: String, error: String?) -> Unit)? = null
    var onAutomationFollowup: ((project: String, jobId: String, error: String?) -> Unit)? = null
    var onAutomationAnswer: ((project: String, jobId: String, error: String?) -> Unit)? = null
    var onJobConfig: (
        (
            project: String,
            jobId: String,
            job: JsonObject?,
            error: String?
        ) -> Unit
    )? = null
    var onJobSaved: ((id: String, error: String?) -> Unit)? = null
    var onJobDeleted: ((id: String, error: String?) -> Unit)? = null
    var onJobsChanged: (() -> Unit)? = null
    var onDuplicateDefaults: (
        (excludeUncommitted: Boolean, reinstallDeps: Boolean, pullLatest: Boolean) -> Unit
    )? = null
    var onDuplicateProgress: ((done: Int, total: Int, name: String) -> Unit)? = null
    var onDuplicateDone: ((error: String?, warning: String?) -> Unit)? = null
    var onProjectsChanged: (() -> Unit)? = null
    var onStatusChanged: ((project: String) -> Unit)? = null

    // A duplicate/remove failed; success is silent (projects-changed refreshes the list).
    var onActionError: ((message: String) -> Unit)? = null

    // The offline send queue is full, so a new request was dropped.
    var onSendQueueFull: (() -> Unit)? = null

    // A runAction/newTerminal/resumeSession the Mac couldn't execute.
    var onActionFailed: ((project: String, message: String) -> Unit)? = null

    // The agents a new tab can start, past conversations to resume, one folder for Files.
    var onAgentOptions: ((agents: List<AgentOption>) -> Unit)? = null
    var onAgentSessions: ((page: AgentSessionsPage) -> Unit)? = null
    var onListDir: ((contents: ProjectDirContents) -> Unit)? = null

    // Git review replies; a null `snapshot` means the `git` request hard-failed.
    var onGit: ((project: String, snapshot: GitSnapshot?, error: String?) -> Unit)? = null
    var onGitDiff: (
        (project: String, path: String, result: GitDiffResult?, error: String?) -> Unit
    )? = null
    var onGitDiffs: ((project: String, entries: List<GitDiffEntry>, error: String?) -> Unit)? = null
    var onGitCommit: ((project: String, error: String?) -> Unit)? = null
    var onGitPush: ((project: String, error: String?) -> Unit)? = null
    var onGitGenMessage: ((project: String, message: String?, error: String?) -> Unit)? = null
    var onGitGenPr: (
        (
            project: String,
            title: String?,
            body: String?,
            error: String?
        ) -> Unit
    )? = null
    var onGitCreatePr: ((project: String, url: String?, error: String?) -> Unit)? = null
    var onGitPull: ((project: String, error: String?) -> Unit)? = null
    var onGitFetch: ((project: String, error: String?) -> Unit)? = null
    var onGitAutoPullUndo: ((project: String, error: String?) -> Unit)? = null
    var onGitBranches: (
        (project: String, current: String, branches: List<GitBranch>, error: String?) -> Unit
    )? = null
    var onGitCheckout: ((project: String, error: String?) -> Unit)? = null
    var onGitDiscardAll: ((project: String, error: String?) -> Unit)? = null
    var onGitChanged: ((project: String) -> Unit)? = null

    // A fresh pairing succeeded: the credential plus the Mac's advertised identity and
    // its current candidate addresses (empty on older Macs).
    var onPaired: (
        (
            deviceId: String,
            token: String,
            serverId: String?,
            serverName: String?,
            hosts: List<String>,
            platform: String?
        ) -> Unit
    )? = null

    // Approve-on-Mac pairing: the dialog is up showing `matchCode`, or it was refused.
    var onPairPending: ((matchCode: String) -> Unit)? = null
    var onPairDenied: ((reason: String, message: String?) -> Unit)? = null

    // The Mac said why it's closing the connection, just before it does; then
    // answered again after all.
    var onFarewell: ((reason: String, at: Instant) -> Unit)? = null
    var onFarewellWithdrawn: (() -> Unit)? = null

    // The raw text of every `projects` and `sidebar` frame, for the saved list.
    var onListFrame: ((text: String) -> Unit)? = null

    // `ready` carried the Mac's identity / candidate addresses (keyed by the frame's
    // serverId — a pairing connection has no active record yet) / lpm build.
    var onIdentity: ((serverId: String?, serverName: String?, platform: String?) -> Unit)? = null
    var onAdvertisedHosts: ((serverId: String?, hosts: List<String>) -> Unit)? = null
    var onBuild: ((build: MacBuild?) -> Unit)? = null
    var onUpdateCheck: ((check: MacUpdateCheck) -> Unit)? = null
    var onUpdateProgress: ((step: MacUpdateStep) -> Unit)? = null
    var onUpdateInstall: ((cancelled: Boolean, error: String?) -> Unit)? = null
    var onUpdateCancel: ((stopping: Boolean) -> Unit)? = null
    var onApnsToken: ((ok: Boolean) -> Unit)? = null
    var onPushToken: ((ok: Boolean) -> Unit)? = null
    var onAnswerAgent: ((reqId: String, error: String?) -> Unit)? = null
    var onLiveActivity: ((ok: Boolean) -> Unit)? = null
    var onComposerActions: ((actions: List<ComposerAction>) -> Unit)? = null
    var onTransformVariant: (
        (
            reqId: String,
            idx: Int,
            text: String?,
            error: String?
        ) -> Unit
    )? = null
    var onTransformDone: ((reqId: String, ok: Boolean) -> Unit)? = null

    // A composer draft mirrored from the Mac; `isSeed` marks one carried by a `seed`.
    var onComposerDraft: (
        (id: String, text: String, rev: Int, origin: String, isSeed: Boolean) -> Unit
    )? = null
    var onServices: (
        (project: String, running: Boolean, services: List<ServiceInfo>, error: String?) -> Unit
    )? = null
    var onServiceLogs: (
        (
            project: String,
            paneIndex: Int,
            text: String?,
            error: String?
        ) -> Unit
    )? = null
    var onActionBgOutput: ((runId: String, snapshot: ActionBgOutput?) -> Unit)? = null
    var onActionBgStartFailed: ((runId: String, error: String) -> Unit)? = null
    var onBackgroundRuns: ((project: String, runs: List<BackgroundRunSummary>) -> Unit)? = null
    var onHistoryQuery: ((items: List<HistoryItem>, hasMore: Boolean) -> Unit)? = null
    var onHistorySaveDraft: ((ok: Boolean) -> Unit)? = null
    var onHistoryToggleFavorite: ((id: String, favorite: Boolean, error: String?) -> Unit)? = null
    var onHistoryMutated: ((ok: Boolean, error: String?) -> Unit)? = null
    var onHistoryFolders: ((folders: List<HistoryFolder>) -> Unit)? = null
    var onHistoryCreateFolder: ((folder: HistoryFolder?, error: String?) -> Unit)? = null
    var onRenameProject: ((project: String, error: String?) -> Unit)? = null
    var onSetWorkStatus: ((project: String, error: String?) -> Unit)? = null
    var onSetAutoPull: ((project: String, error: String?) -> Unit)? = null
    var onClaudeAccounts: ((accounts: ClaudeAccounts?) -> Unit)? = null
    var onSetClaudeAccount: ((project: String, error: String?) -> Unit)? = null
    var onGitCreateBranch: ((project: String, error: String?) -> Unit)? = null
    var onGitAuto: ((project: String, run: GitAutoRun?, error: String?) -> Unit)? = null
    var onGitAutoSwitchBase: (
        (project: String, base: String, error: String?, pullError: String?) -> Unit
    )? = null

    // A folder mutation settled, carrying the fresh layout on success.
    var onSidebarMutation: (
        (order: List<String>, groups: List<ProjectFolder>, error: String?) -> Unit
    )? = null
    var onFileChunk: ((chunk: FileChunk) -> Unit)? = null
    var onListDirs: ((listing: DirListing?, error: String?) -> Unit)? = null
    var onListSshHosts: ((hosts: List<SshHostInfo>, error: String?) -> Unit)? = null
    var onMachines: ((machines: List<RemoteMachine>) -> Unit)? = null
    var onMachinePair: ((slug: String, offer: MachinePairOffer?, error: String?) -> Unit)? = null
    var onCreateProject: ((name: String, error: String?) -> Unit)? = null
    var onCreateSshProject: ((name: String, error: String?) -> Unit)? = null
    var onCloneProject: ((name: String, error: String?) -> Unit)? = null
    var onReadConfig: (
        (
            project: String,
            layer: String,
            content: String,
            available: Boolean,
            error: String?
        ) -> Unit
    )? = null
    var onSaveConfig: (
        (
            project: String,
            layer: String,
            name: String,
            error: String?
        ) -> Unit
    )? = null
    var onServiceBody: (
        (project: String, key: String, body: JsonObject?, source: String, error: String?) -> Unit
    )? = null
    var onActionBody: (
        (
            project: String,
            key: String,
            body: JsonObject?,
            section: String,
            source: String,
            error: String?
        ) -> Unit
    )? = null
    var onSaveService: ((project: String, key: String, error: String?) -> Unit)? = null
    var onDeleteService: ((project: String, key: String, error: String?) -> Unit)? = null
    var onSaveProfile: ((project: String, name: String, error: String?) -> Unit)? = null
    var onDeleteProfile: ((project: String, name: String, error: String?) -> Unit)? = null
    var onSaveAction: ((project: String, key: String, error: String?) -> Unit)? = null
    var onDeleteAction: ((project: String, key: String, error: String?) -> Unit)? = null

    // Session memory; `onMemoryChanged` carries the OWNER folder (a duplicate's original).
    var onMemory: ((project: String, list: MemoryList?, error: String?) -> Unit)? = null
    var onMemorySession: (
        (project: String, name: String, session: MemorySession?, error: String?) -> Unit
    )? = null
    var onMemorySave: ((project: String, name: String, error: String?) -> Unit)? = null
    var onMemoryDelete: ((project: String, name: String, error: String?) -> Unit)? = null
    var onMemoryChanged: ((project: String) -> Unit)? = null

    // Notes replies, each carrying the keys its request was addressed by (out of order).
    var onNotesChats: ((project: String, chats: List<NoteChat>, error: String?) -> Unit)? = null
    var onNotesCreateChat: ((project: String, chat: NoteChat?, error: String?) -> Unit)? = null
    var onNotesRenameChat: ((project: String, chatId: String, error: String?) -> Unit)? = null
    var onNotesDeleteChat: ((project: String, chatId: String, error: String?) -> Unit)? = null
    var onNotesMessages: (
        (
            project: String,
            chatId: String,
            beforeId: String,
            messages: List<NoteMessage>,
            error: String?
        ) -> Unit
    )? = null
    var onNotesAddMessage: (
        (project: String, chatId: String, message: NoteMessage?, error: String?) -> Unit
    )? = null
    var onNotesEditMessage: ((project: String, id: String, error: String?) -> Unit)? = null
    var onNotesDeleteMessage: ((project: String, id: String, error: String?) -> Unit)? = null
    var onNotesSearch: (
        (project: String, query: String, hits: List<NoteSearchHit>, error: String?) -> Unit
    )? = null
    var onNotesAttachment: (
        (
            project: String,
            hash: String,
            data: String?,
            error: String?
        ) -> Unit
    )? = null
}

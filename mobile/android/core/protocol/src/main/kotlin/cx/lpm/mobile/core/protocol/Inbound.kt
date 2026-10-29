package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.ActionBgOutput as BgOutput
import cx.lpm.mobile.core.model.AgentOption
import cx.lpm.mobile.core.model.AgentSessionsPage
import cx.lpm.mobile.core.model.AgentStats
import cx.lpm.mobile.core.model.AutoPullMode
import cx.lpm.mobile.core.model.AutomationHistoryEntry
import cx.lpm.mobile.core.model.AutomationJob
import cx.lpm.mobile.core.model.AutomationLiveOutput
import cx.lpm.mobile.core.model.AutomationMachine
import cx.lpm.mobile.core.model.BackgroundRunSummary
import cx.lpm.mobile.core.model.ClaudeAccounts as ClaudeAccountsReply
import cx.lpm.mobile.core.model.ComposerAction
import cx.lpm.mobile.core.model.ControlOwner
import cx.lpm.mobile.core.model.CustomWorkStatus
import cx.lpm.mobile.core.model.DirListing
import cx.lpm.mobile.core.model.FileChunk as FileRange
import cx.lpm.mobile.core.model.GitAutoRun
import cx.lpm.mobile.core.model.GitBranch
import cx.lpm.mobile.core.model.GitDiffEntry
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
import cx.lpm.mobile.core.model.MemorySession as MemoryDoc
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
import cx.lpm.mobile.core.model.UploadStep as UploadReply
import cx.lpm.mobile.core.model.WeeklyRecap as WeekRecap
import kotlinx.serialization.json.JsonObject

/**
 * A frame from the Mac, decoded leniently: an unknown `t` (or a success ack nothing
 * acts on) parses to null, unknown fields are ignored, and a missing field takes the
 * same default as on iOS. Requests' failures carry the message to surface in
 * `error`, null on success.
 */
sealed interface Inbound {
    // `platform` is "macos"/"linux", null from an older build (treat as a Mac);
    // `features` names requests it answers that an older Mac would silently ignore.
    data class Paired(
        val deviceId: String,
        val token: String,
        val serverId: String?,
        val serverName: String?,
        val hosts: List<String>,
        val platform: String?,
        val build: MacBuild?,
        val features: Set<String>
    ) : Inbound

    // Approve-on-Mac pairing: the Mac put up its Allow dialog showing this code.
    data class PairPending(val matchCode: String) : Inbound

    // "busy", "declined" (with a `message` from a headless host), or "timeout".
    data class PairDenied(val reason: String, val message: String?) : Inbound

    data class Ready(
        val serverId: String?,
        val serverName: String?,
        val hosts: List<String>,
        val platform: String?,
        val build: MacBuild?,
        val features: Set<String>
    ) : Inbound

    // The Mac is about to close this connection on purpose: "sleep", "quit" or "off".
    data class Bye(val reason: String, val at: Long?) : Inbound
    data class Error(val message: String) : Inbound

    data class Projects(
        val projects: List<Project>,
        val workStatuses: List<CustomWorkStatus>,
        val workStatusOrder: List<String>,
        val autoPullMode: AutoPullMode,
        /** How many seen agents a project lists before folding the rest, 1–10. */
        val seenAgentsShown: Int = 3,
        /** The Mac keeps finished agents as seen once opened, until they're archived. */
        val keepFinishedAgents: Boolean = false
    ) : Inbound

    data class Sidebar(val order: List<String>, val groups: List<ProjectFolder>) : Inbound
    data class Stats(val stats: AgentStats?, val error: String?) : Inbound
    data class Limits(val snapshot: LimitsSnapshot?, val error: String?) : Inbound

    // `week` is "last" or "this", echoed so a reply lands on the week it answers.
    data class WeeklyRecap(
        val week: String,
        val period: String,
        val recap: WeekRecap?,
        val error: String?
    ) : Inbound
    data class LimitsChanged(val snapshot: LimitsSnapshot) : Inbound
    data class TtsSpeak(val reqId: String, val audio: String?, val error: String?) : Inbound
    data class Terminals(val project: String, val terminals: List<TerminalInfo>) : Inbound
    data class Slash(val id: String, val commands: List<SlashCommand>) : Inbound
    data class Mentions(val project: String, val entries: List<MentionEntry>) : Inbound
    data class History(val project: String, val rows: List<HistoryRow>) : Inbound
    data class Upload(val id: String, val reqId: String, val path: String) : Inbound
    data class UploadStep(val step: UploadReply) : Inbound
    data class Status(
        val project: String,
        val entries: List<StatusEntry>,
        val seen: List<StatusEntry> = emptyList()
    ) : Inbound
    data class Jobs(
        val jobs: List<AutomationJob>,
        val error: String?,
        val machines: List<AutomationMachine> = emptyList()
    ) : Inbound

    data class JobHistory(
        val project: String,
        val jobId: String,
        val entries: List<AutomationHistoryEntry>,
        val error: String?
    ) : Inbound

    data class JobLiveOutput(
        val project: String,
        val jobId: String,
        val live: AutomationLiveOutput?,
        val error: String?
    ) : Inbound

    data class AutomationMutation(val project: String, val jobId: String, val error: String?) :
        Inbound
    data class AutomationFollowup(val project: String, val jobId: String, val error: String?) :
        Inbound
    data class AutomationAnswer(val project: String, val jobId: String, val error: String?) :
        Inbound

    data class JobConfig(
        val project: String,
        val jobId: String,
        val job: JsonObject?,
        val error: String?
    ) : Inbound

    data class JobSaved(val id: String, val error: String?) : Inbound
    data class JobDeleted(val id: String, val error: String?) : Inbound
    data object JobsChanged : Inbound

    // `reset` false means `data` is the slice this phone missed while it was away —
    // append it and keep the screen. `off` is the byte-stream position after `data`
    // (null from a Mac too old to send one, which turns stream tracking off).
    data class Seed(
        val id: String,
        val cols: Int,
        val rows: Int,
        val data: String,
        val owner: ControlOwner?,
        val draftText: String?,
        val draftRev: Int,
        val off: Long?,
        val reset: Boolean
    ) : Inbound

    data class Control(val id: String, val owner: ControlOwner?) : Inbound

    // `off` is the byte-stream position after this chunk, so the phone can tell a
    // chunk a seed already covered from one that follows a dropped frame.
    data class Output(val id: String, val data: String, val off: Long?) : Inbound
    data class Exit(val id: String, val code: Int, val gone: Boolean) : Inbound
    data class DuplicateProgress(val done: Int, val total: Int, val name: String) : Inbound

    // `warning` is a non-fatal note (e.g. copies made but the run task needs the Mac app open).
    data class Duplicate(val name: String, val error: String?, val warning: String?) : Inbound

    data class DuplicateDefaults(
        val excludeUncommitted: Boolean,
        val reinstallDeps: Boolean,
        val pullLatest: Boolean
    ) : Inbound

    data class Remove(val error: String?) : Inbound

    // A restartService/stopService reply; `error` is null when the Mac took it.
    data class ServiceOp(val error: String?) : Inbound
    data class RenameProject(val project: String, val error: String?) : Inbound
    data class SetWorkStatus(val project: String, val error: String?) : Inbound
    data class SetAutoPull(val project: String, val error: String?) : Inbound
    data class ClaudeAccounts(val accounts: ClaudeAccountsReply?) : Inbound
    data class SetClaudeAccount(val project: String, val error: String?) : Inbound

    // A folder create/rename/delete/move reply, carrying the updated sidebar on success.
    data class SidebarMutation(
        val order: List<String>,
        val groups: List<ProjectFolder>,
        val error: String?
    ) : Inbound

    data class FileChunk(val chunk: FileRange) : Inbound

    // A runAction/newTerminal/resumeSession the Mac couldn't execute; success acks parse to null.
    data class ActionFailed(val project: String, val error: String) : Inbound

    // The agents a new tab can start, past conversations to resume, and one project
    // folder for Files.
    data class AgentOptions(val agents: List<AgentOption>) : Inbound
    data class AgentSessions(val page: AgentSessionsPage) : Inbound
    data class ListDir(val contents: ProjectDirContents) : Inbound
    data object ProjectsChanged : Inbound
    data class StatusChanged(val project: String) : Inbound

    // `snapshot` is null only on a hard failure — a non-repo is a snapshot with isRepo false.
    data class Git(val project: String, val snapshot: GitSnapshot?, val error: String?) : Inbound

    data class GitDiff(
        val project: String,
        val path: String,
        val diff: String,
        val binary: Boolean,
        val truncated: Boolean,
        val error: String?
    ) : Inbound

    data class GitDiffs(val project: String, val entries: List<GitDiffEntry>, val error: String?) :
        Inbound
    data class GitCommit(val project: String, val error: String?) : Inbound
    data class GitPush(val project: String, val error: String?) : Inbound
    data class GitGenMessage(val project: String, val message: String?, val error: String?) :
        Inbound

    data class GitGenPr(
        val project: String,
        val title: String?,
        val body: String?,
        val error: String?
    ) : Inbound

    data class GitCreatePr(val project: String, val url: String?, val error: String?) : Inbound
    data class GitPull(val project: String, val error: String?) : Inbound
    data class GitFetch(val project: String, val error: String?) : Inbound
    data class GitAutoPullUndo(val project: String, val error: String?) : Inbound

    data class GitBranches(
        val project: String,
        val current: String,
        val branches: List<GitBranch>,
        val error: String?
    ) : Inbound

    data class GitCheckout(val project: String, val error: String?) : Inbound
    data class GitCreateBranch(val project: String, val error: String?) : Inbound
    data class GitDiscardAll(val project: String, val error: String?) : Inbound
    data class GitChanged(val project: String) : Inbound
    data class GitAuto(val project: String, val run: GitAutoRun?, val error: String?) : Inbound

    data class GitAutoSwitchBase(
        val project: String,
        val base: String,
        val error: String?,
        val pullError: String?
    ) : Inbound

    data class ApnsToken(val ok: Boolean) : Inbound
    data class PushToken(val ok: Boolean) : Inbound
    data class AnswerAgent(val reqId: String, val error: String?) : Inbound
    data class LiveActivity(val ok: Boolean) : Inbound
    data class ComposerActions(val actions: List<ComposerAction>) : Inbound

    // One transform variant settled; `reqId` matches the request, `idx` the variant slot.
    data class TransformVariant(
        val reqId: String,
        val idx: Int,
        val text: String?,
        val error: String?
    ) : Inbound

    // The transform batch finished; `ok` is true if any variant succeeded.
    data class TransformDone(val reqId: String, val ok: Boolean) : Inbound

    // `origin` is "mac" or the sending phone's deviceId (so we drop our own echo);
    // `rev` is the monotonic revision for stale-frame rejection.
    data class ComposerDraft(val id: String, val text: String, val rev: Int, val origin: String) :
        Inbound

    data class Services(
        val project: String,
        val running: Boolean,
        val services: List<ServiceInfo>,
        val error: String?
    ) : Inbound

    data class ServiceLogs(
        val project: String,
        val paneIndex: Int,
        val text: String?,
        val error: String?
    ) : Inbound

    // `snapshot` is null once the run has been reaped on the Mac (or never existed).
    data class ActionBgOutput(val runId: String, val snapshot: BgOutput?) : Inbound
    data class ActionBgStartFailed(val runId: String, val error: String) : Inbound
    data class BackgroundRuns(val project: String, val runs: List<BackgroundRunSummary>) : Inbound
    data class HistoryQuery(val items: List<HistoryItem>, val hasMore: Boolean) : Inbound
    data class HistorySaveDraft(val ok: Boolean) : Inbound
    data class HistoryToggleFavorite(val id: String, val favorite: Boolean, val error: String?) :
        Inbound
    data class HistoryMutated(val ok: Boolean, val error: String?) : Inbound
    data class HistoryFolders(val folders: List<HistoryFolder>) : Inbound
    data class HistoryCreateFolder(val folder: HistoryFolder?, val error: String?) : Inbound
    data class ListDirs(val listing: DirListing?, val error: String?) : Inbound
    data class ListSshHosts(val hosts: List<SshHostInfo>, val error: String?) : Inbound
    data class Machines(val machines: List<RemoteMachine>) : Inbound
    data class MachinePair(val slug: String, val offer: MachinePairOffer?, val error: String?) :
        Inbound
    data class CreateProject(val name: String, val error: String?) : Inbound
    data class CreateSshProject(val name: String, val error: String?) : Inbound
    data class CloneProject(val name: String, val error: String?) : Inbound

    data class ReadConfig(
        val project: String,
        val layer: String,
        val content: String,
        val available: Boolean,
        val error: String?
    ) : Inbound

    // `name` is the possibly-renamed project (project layer); echoes the input otherwise.
    data class SaveConfig(
        val project: String,
        val layer: String,
        val name: String,
        val error: String?
    ) : Inbound

    data class ServiceBody(
        val project: String,
        val key: String,
        val body: JsonObject?,
        val source: String,
        val error: String?
    ) : Inbound

    data class ActionBody(
        val project: String,
        val key: String,
        val body: JsonObject?,
        val section: String,
        val source: String,
        val error: String?
    ) : Inbound

    data class SaveService(val project: String, val key: String, val error: String?) : Inbound
    data class DeleteService(val project: String, val key: String, val error: String?) : Inbound
    data class SaveProfile(val project: String, val name: String, val error: String?) : Inbound
    data class DeleteProfile(val project: String, val name: String, val error: String?) : Inbound
    data class SaveAction(val project: String, val key: String, val error: String?) : Inbound
    data class DeleteAction(val project: String, val key: String, val error: String?) : Inbound

    // `list` is null only on a hard failure — an empty folder is a list with `exists` false.
    data class Memory(val project: String, val list: MemoryList?, val error: String?) : Inbound

    data class MemorySession(
        val project: String,
        val name: String,
        val session: MemoryDoc?,
        val error: String?
    ) : Inbound

    // A lost compare-and-swap comes back as the bare literal "modified" in `error`.
    data class MemorySave(val project: String, val name: String, val error: String?) : Inbound
    data class MemoryDelete(val project: String, val name: String, val error: String?) : Inbound

    // `project` is the OWNER folder name, which for a duplicate is its original's.
    data class MemoryChanged(val project: String) : Inbound
    data class NotesChats(val project: String, val chats: List<NoteChat>, val error: String?) :
        Inbound
    data class NotesCreateChat(val project: String, val chat: NoteChat?, val error: String?) :
        Inbound
    data class NotesRenameChat(val project: String, val chatId: String, val error: String?) :
        Inbound
    data class NotesDeleteChat(val project: String, val chatId: String, val error: String?) :
        Inbound

    data class NotesMessages(
        val project: String,
        val chatId: String,
        val beforeId: String,
        val messages: List<NoteMessage>,
        val error: String?
    ) : Inbound

    data class NotesAddMessage(
        val project: String,
        val chatId: String,
        val message: NoteMessage?,
        val error: String?
    ) : Inbound

    data class NotesEditMessage(val project: String, val id: String, val error: String?) : Inbound
    data class NotesDeleteMessage(val project: String, val id: String, val error: String?) : Inbound

    data class NotesSearch(
        val project: String,
        val query: String,
        val hits: List<NoteSearchHit>,
        val error: String?
    ) : Inbound

    data class NotesAttachment(
        val project: String,
        val hash: String,
        val data: String?,
        val error: String?
    ) : Inbound

    data class UpdateCheck(val check: MacUpdateCheck) : Inbound
    data class UpdateProgress(val step: MacUpdateStep) : Inbound

    // Only answers an install that stopped short; one that finished restarts lpm instead.
    data class UpdateInstall(val cancelled: Boolean, val error: String?) : Inbound
    data class UpdateCancel(val stopping: Boolean) : Inbound
    data object Pong : Inbound

    companion object {
        fun parse(text: String): Inbound? = decodeInbound(text)
    }
}

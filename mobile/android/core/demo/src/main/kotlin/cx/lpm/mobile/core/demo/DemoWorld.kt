package cx.lpm.mobile.core.demo

import java.time.Clock

/**
 * All mutable state of the simulated Mac behind Demo Mode, grouped per domain. The
 * domain handlers (DemoProjects, DemoTerminals, …) read and mutate these values and
 * turn them into wire frames through the builders in DemoWorldPayloads.
 *
 * Swift keeps these as value types; here they are mutable classes whose collections
 * are replaced rather than mutated, so `copy()` is a value copy wherever Swift copies.
 */
internal class DemoWorld(val clock: Clock) {
    // Projects

    data class Svc(var name: String, var cmd: String, var port: Int, var running: Boolean)

    data class Profile(var name: String, var services: List<String>)

    data class Status(
        val key: String,
        // Running | Done | Waiting | Error
        val value: String,
        val priority: Int,
        // unix millis
        val timestamp: Long,
        // the terminal reporting it
        val paneID: String,
        // unix millis; 0 when never seen starting
        val turnStart: Long = 0,
        // unix millis; 0 while it runs
        val endedAt: Long = 0,
        // unix millis; only on a seen agent
        val seenAt: Long = 0
    )

    data class Project(
        var name: String,
        var label: String,
        var running: Boolean,
        var isRemote: Boolean = false,
        var parentName: String = "",
        var worktree: Boolean = false,
        // The person-set work status, as the raw wire dict the Mac would send.
        var workStatus: Dict? = null,
        var autoPull: Boolean? = null,
        // The project's own Claude account keys, as its YAML would hold them.
        var claudeAccount: String? = null,
        var claudeAccounts: List<String>? = null,
        var services: List<Svc> = emptyList(),
        var profiles: List<Profile> = emptyList(),
        var activeProfile: String = "",
        // Action mappings kept as raw wire dicts: the shape is recursive and largely
        // inert data, so structuring it would only add friction.
        var actions: List<Dict> = emptyList(),
        // Zones as the Mac sends them (ZoneInfo), sorted by position.
        var zones: List<Dict> = emptyList(),
        var status: List<Status> = emptyList(),
        // Finished agents already opened, kept until archived.
        var seen: List<Status> = emptyList()
    ) {
        fun deepCopy() = copy(
            services = services.map { it.copy() },
            profiles = profiles.map { it.copy() }
        )
    }

    var projects = mutableListOf<Project>()
    val claude = ClaudeDemo()

    data class BgRunLine(val at: Double, val text: String)

    data class BgRun(
        val runId: String,
        val project: String,
        val label: String,
        val startedAt: Long,
        val startedRef: Double,
        val duration: Double,
        val lines: List<BgRunLine>,
        var cancelledAt: Double? = null
    )

    // In-flight and recently finished background action runs (reaped after ~5 min,
    // mirroring the desktop registry's retention).
    val backgroundRuns = mutableListOf<BgRun>()

    // Limit reminders set from the Usage screen.
    val limitReminders = mutableListOf<Dict>()

    // Poll counters ("project\nservice") so service logs grow between polls.
    val serviceLogTicks = mutableMapOf<String, Int>()
    val serviceLogWatches = mutableMapOf<String, Int>() // project + "\n" + pane -> watch token
    var serviceLogWatchSeq = 0

    // Sidebar

    data class Folder(
        val id: String,
        var name: String,
        val collapsed: Boolean,
        var members: List<String>
    )

    var sidebarOrder = mutableListOf<String>()
    var folders = mutableListOf<Folder>()

    // The desktop's persisted duplicate-modal toggle defaults.
    var duplicateExcludeUncommitted = false
    var duplicateReinstallDeps = false
    var duplicatePullLatest = true

    // Terminals

    data class Terminal(
        var id: String,
        var label: String,
        var project: String,
        var cols: Int = 80,
        var rows: Int = 24,
        val remote: Boolean = false,
        var pinned: Boolean = false,
        val emoji: String = "",
        val cli: String = "",
        // Recent scrollback replayed on subscribe; the terminal engine appends to it.
        var buffer: String = "",
        // Set once a per-terminal live script (dev log / Claude session) has begun, so a
        // re-subscribe doesn't replay it from the start.
        var scriptStarted: Boolean = false,
        var scriptFinished: Boolean = false,
        var subscribed: Boolean = false,
        var pendingInput: String = "",
        // Input submitted while the Claude script or an ack is still streaming, replayed
        // at the next idle prompt instead of being dropped.
        var queuedInput: String = "",
        var queuedSubmit: Boolean = false,
        var logTickArmed: Boolean = false,
        var responding: Boolean = false,
        var ackCount: Int = 0,
        // Its shell ran `exit`: the tab stays, as on the Mac, until it is restarted.
        var exited: Boolean = false
    )

    val terminals = mutableMapOf<String, MutableList<Terminal>>() // project -> terminals

    data class ComposerDraft(val text: String, val rev: Int)

    // Mirrored composer drafts keyed by terminal id. `composerDraftRev` is globally
    // monotonic (like the Mac hub's) so a re-typed draft always outranks a prior one.
    val composerDrafts = mutableMapOf<String, ComposerDraft>()
    var composerDraftRev = 0
    val uploadNames = mutableMapOf<String, String>() // chunked uploadId -> file name

    // Git

    data class GitFile(
        val path: String,
        // added | deleted | renamed | modified | untracked
        val status: String,
        val staged: Boolean = false,
        val stamp: String,
        val diff: String = ""
    )

    data class GitBranch(val name: String, val committerDate: String, val remote: String = "")

    data class GitRepo(
        val isRepo: Boolean = true,
        var branch: String,
        var detached: Boolean = false,
        var hasUpstream: Boolean = true,
        var ahead: Int = 0,
        var behind: Int = 0,
        val defaultBranch: String = "main",
        val ghCli: Boolean = true,
        var files: List<GitFile> = emptyList(),
        var branches: List<GitBranch> = emptyList(),
        var watched: Boolean = false,
        // Per-branch ahead counts so a checkout restores the branch it left.
        var aheadByBranch: Map<String, Int> = emptyMap(),
        // The last auto pull, as the raw wire dict, while it can be undone.
        var autoPulled: Dict? = null
    )

    val git = mutableMapOf<String, GitRepo>() // project -> repo
    val gitAutoRuns = mutableMapOf<String, GitAutoRun>() // project -> last Auto Commit / PR run
    var gitAutoNextId = 1

    // Jobs (automations)

    data class JobRun(
        val at: Long,
        val result: String,
        val count: Int = 1,
        val copy: String = "",
        val output: String = "",
        val durationSecs: Int? = null,
        val costUsd: Double? = null,
        val question: String = "",
        val session: String = "",
        val resumed: String = "",
        val follows: Long? = null,
        // Questions the run put to the user, in the Mac's JobAsk shape.
        val asks: List<Dict> = emptyList(),
        val answerTo: String = ""
    )

    data class Job(
        val id: String,
        var project: String,
        var label: String,
        var emoji: String = "",
        var enabled: Boolean = true,
        var source: String = "project",
        var duplicate: Boolean = false,
        // action | cmd | prompt
        var runKind: String = "cmd",
        // the prompt, command, or action name
        var summary: String = "",
        // interval | calendar
        var scheduleMode: String = "calendar",
        var everySecs: Int = 0,
        var everyMaxSecs: Int = 0,
        var atMinutes: Int = 0,
        var untilMinutes: Int? = null,
        var times: Int = 1,
        var days: List<String> = emptyList(),
        var pickDays: Int = 0,
        var lastRunAt: Long? = null,
        var lastResult: String = "",
        var nextFireAt: Long? = null,
        var running: Boolean = false,
        var runningSince: Long? = null,
        var agent: String = "",
        var model: String = "",
        var effort: String = "",
        var history: List<JobRun> = emptyList(),
        // Live output of an in-flight simulated run (null when idle).
        var liveStartedAt: Long? = null,
        var liveText: String = "",
        // The stored YAML-shaped body (label/emoji/schedule/run/…) the editor
        // round-trips through jobConfig/saveJob.
        var body: Dict = emptyMap(),
        // Bumped on every run start so a stopped run's stale timers no-op.
        var runSeq: Int = 0,
        // When this automation was last read: runs after it are the unread ones.
        var seenAt: Long = 0
    )

    var jobs = mutableListOf<Job>()

    // Config

    // Raw YAML per "<project>\n<layer>" (layer ∈ project|repo|global). A missing key
    // reads back as an empty, available layer.
    val configText = mutableMapOf<String, String>()

    // Managed service fields the typed `Svc` can't hold (cwd, portConflict, env,
    // dependsOn), keyed "<project>\n<service>", so structured edits round-trip.
    val serviceExtras = mutableMapOf<String, Dict>()

    // History (message history screen)

    data class HistoryMessage(
        val id: String,
        val text: String,
        // unix millis
        val timestamp: Long,
        var favorite: Boolean = false,
        var folder: String? = null,
        val kind: String = "sent",
        val project: String,
        val at: Long,
        val seq: Int
    )

    var historyMessages = mutableListOf<HistoryMessage>()

    data class HistoryFolder(val id: String, val name: String)

    var historyFolders = mutableListOf<HistoryFolder>()

    // Session memory

    data class MemoryDoc(
        val name: String,
        var title: String,
        var content: String,
        // unix SECONDS; every Notes timestamp below is millis
        var updatedAt: Long
    )

    // Session logs keyed by the folder that owns them, which for a duplicate is its
    // original's. A missing key is the empty state (`exists: false`); an empty list is
    // a folder whose logs were all deleted.
    val memoryDocs = mutableMapOf<String, MutableList<MemoryDoc>>()

    // Notes

    data class NoteAttachmentRec(
        val hash: String,
        val name: String,
        val size: Int,
        val mimeType: String
    )

    data class NoteRec(
        val id: String,
        val chatId: String,
        // Paging order: `beforeId` resolves to a seq and older notes are the ones below
        // it. Ids stay opaque on the wire.
        val seq: Int,
        // unix millis
        val ts: Long,
        var text: String,
        var editedAt: Long? = null,
        val attachments: List<NoteAttachmentRec> = emptyList()
    )

    data class NoteChatRec(
        val id: String,
        var title: String,
        // unix millis
        var createdAt: Long,
        // unix millis
        var updatedAt: Long
    )

    val noteChats = mutableMapOf<String, MutableList<NoteChatRec>>() // project -> chats
    val noteMessages = mutableMapOf<String, MutableList<NoteRec>>() // project -> notes
    var noteBlobs = mutableMapOf<String, String>() // attachment hash -> base64 bytes
    var noteSeq = 0

    init {
        val now = clock.instant()
        val nowMs = now.toEpochMilli()
        val nowS = now.epochSecond
        seedProjects()
        seedSidebar()
        seedTerminals()
        seedGit(nowS)
        seedJobs(nowS)
        seedConfig()
        seedHistory(nowMs)
        seedSeenAgents(nowMs)
    }

    fun project(named: String): Project? = projects.firstOrNull { it.name == named }

    fun projectIndex(name: String): Int? =
        projects.indexOfFirst { it.name == name }.takeIf { it >= 0 }

    companion object {
        /**
         * The title the demo's Claude conversation would have; a tab that doesn't show
         * it offers "Use Conversation Title".
         */
        const val CONVERSATION_TITLE = "Two-step checkout"
    }
}

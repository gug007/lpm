package cx.lpm.mobile.core.protocol

import org.junit.Assert.assertEquals
import org.junit.Test

class WireCoverageTest {
    // Every static func on iOS's Wire, its MemoryTypes and NotesTypes extensions included.
    private val iosBuilders = listOf(
        "json", "pair", "pairRequest", "auth", "relay", "unpair", "projects", "sidebar", "stats",
        "limits", "ttsSpeak", "terminals", "slash", "upload", "uploadBegin", "uploadChunk",
        "uploadDone", "uploadAbort", "mentions", "history", "historyAdd", "status", "clearStatus",
        "jobs", "jobHistory", "jobLiveOutput", "runJob", "stopJob", "setJobEnabled", "markJobSeen",
        "markAllJobsSeen", "sendJobFollowup", "answerJobQuestion", "dismissJobQuestion",
        "jobConfig", "saveJob", "deleteJob", "sub", "unsub",
        "claim", "presence", "input", "resize", "runAction", "runActionBackground",
        "actionBgOutput", "cancelActionBackground", "backgroundRuns", "newTerminal",
        "closeTerminal", "renameTerminal", "pinTerminal", "reorderTerminals", "duplicate",
        "duplicateDefaults", "remove", "renameProject", "setWorkStatus", "setAutoPull",
        "claudeAccounts", "setClaudeAccount", "sidebarCreateFolder", "sidebarRenameFolder",
        "sidebarDeleteFolder", "sidebarMoveProject", "fileChunk", "start", "stop", "toggleService",
        "ping", "apnsToken", "git", "gitDiff", "gitDiffs", "gitCommit", "gitPush", "gitGenMessage",
        "gitGenPr", "gitCreatePr", "gitPull", "gitFetch", "gitAutoPullUndo", "gitBranches",
        "gitCheckout", "gitCreateBranch", "gitDiscardAll", "gitAuto", "gitAutoState",
        "gitAutoCancel", "gitAutoSwitchBase", "gitWatch", "updateCheck", "updateInstall",
        "updateCancel", "gitUnwatch", "composerActions", "composerDraft", "transform", "services",
        "serviceLogs", "serviceLogsWatch", "historyQuery", "historySaveDraft",
        "historyToggleFavorite", "historySetFolder", "historyDelete", "historyFolders",
        "historyCreateFolder", "historyDeleteFolder", "listDirs", "listSshHosts", "machines",
        "machinePair", "createProject", "createSshProject", "cloneProject", "readConfig",
        "saveConfig", "serviceBody", "actionBody", "saveService", "deleteService", "saveProfile",
        "deleteProfile", "saveAction", "deleteAction", "reqIdString", "hexFrame", "label", "memory",
        "memorySession", "memorySave", "memoryDelete", "slugify", "notesChats", "notesCreateChat",
        "notesRenameChat", "notesDeleteChat", "notesMessages", "notesAddMessage",
        "notesEditMessage", "notesDeleteMessage", "notesSearch", "notesAttachment",
        "restartService", "stopService", "restartTerminal", "agentOptions", "agentSessions",
        "resumeSession", "listDir", "answerAgent", "liveActivity", "weeklyRecap", "archiveStatus",
        "markStatusSeen", "markStatusUnread"
    )

    @Test
    fun everyIosBuilderHasAKotlinCounterpart() {
        assertEquals(157, iosBuilders.toSet().size)
        val kotlin = Wire::class.java.methods.map { it.name }.toSet()
        assertEquals(emptyList<String>(), iosBuilders.filterNot { it in kotlin })
    }
}

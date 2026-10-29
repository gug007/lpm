package cx.lpm.mobile.core.protocol

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class InboundCoverageTest {
    // Every `t` iOS's Wire.Inbound.parse switches on.
    private val iosTypes = setOf(
        "paired", "pairPending", "pairDenied", "ready", "bye", "error", "projects", "sidebar",
        "ttsSpeak", "stats", "limits", "terminals", "slash", "mentions", "history", "upload",
        "uploadBegin", "uploadChunk", "uploadDone", "status", "jobs", "jobHistory", "jobLiveOutput",
        "runJob", "stopJob", "setJobEnabled", "sendJobFollowup", "answerJobQuestion",
        "dismissJobQuestion", "jobConfig", "saveJob",
        "deleteJob", "jobs-changed", "limits-changed", "seed", "control", "o", "exit",
        "duplicateProgress", "duplicate", "duplicateDefaults", "remove", "renameProject",
        "setWorkStatus", "setAutoPull", "claudeAccounts", "setClaudeAccount", "sidebarCreateFolder",
        "sidebarRenameFolder", "sidebarDeleteFolder", "sidebarMoveProject", "fileChunk",
        "runAction", "newTerminal", "projects-changed", "status-changed", "git", "gitDiff",
        "gitDiffs", "gitCommit", "gitPush", "gitGenMessage", "gitGenPr", "gitCreatePr", "gitPull",
        "gitFetch", "gitAutoPullUndo", "gitBranches", "gitCheckout", "gitCreateBranch",
        "gitDiscardAll", "git-changed", "gitAuto", "gitAutoSwitchBase", "apnsToken",
        "composerActions", "transform", "transformDone", "composerDraft", "services", "serviceLogs",
        "actionBgOutput", "runActionBackground", "backgroundRuns", "historyQuery",
        "historySaveDraft", "historyToggleFavorite", "historySetFolder", "historyDelete",
        "historyDeleteFolder", "historyFolders", "historyCreateFolder", "listDirs", "listSshHosts",
        "machines", "machinePair", "createProject", "createSshProject", "cloneProject",
        "readConfig", "saveConfig", "serviceBody", "actionBody", "saveService", "deleteService",
        "saveProfile", "deleteProfile", "saveAction", "deleteAction", "memory", "memorySession",
        "memorySave", "memoryDelete", "memory-changed", "notesChats", "notesCreateChat",
        "notesRenameChat", "notesDeleteChat", "notesMessages", "notesAddMessage",
        "notesEditMessage", "notesDeleteMessage", "notesSearch", "notesAttachment", "updateCheck",
        "updateProgress", "updateInstall", "updateCancel", "pong", "restartService",
        "stopService", "resumeSession", "agentOptions", "agentSessions", "listDir", "answerAgent",
        "liveActivity", "weeklyRecap", "limitReminders", "wake"
    )

    // Replies only Android asks for: iOS registers for push with `apnsToken`.
    private val androidOnlyTypes = setOf("pushToken")

    @Test
    fun decodesExactlyTheTypesIosDoesPlusAndroidsOwn() {
        assertEquals(140, iosTypes.size)
        assertEquals(iosTypes + androidOnlyTypes, inboundParsers.keys)
    }

    @Test
    fun noDomainTableShadowsAnother() {
        val tables = listOf(
            sessionParsers,
            projectParsers,
            configParsers,
            terminalParsers,
            composerParsers,
            automationParsers,
            gitParsers,
            memoryNotesParsers,
            serviceParsers
        )
        assertEquals(inboundParsers.size, tables.sumOf { it.size })
    }

    @Test
    fun everyTypeDecodesFromAFailedOrBareFrame() {
        for (t in iosTypes + androidOnlyTypes) {
            assertNotNull(t, Inbound.parse("""{ "t": "$t", "ok": false }"""))
        }
    }

    @Test
    fun unknownOrBrokenFramesAreNull() {
        assertNull(Inbound.parse("""{ "t": "unpaired" }"""))
        assertNull(Inbound.parse("""{ "t": "file", "ok": true }"""))
        assertNull(Inbound.parse("""{ "t": 3 }"""))
        assertNull(Inbound.parse("""{ "id": "x" }"""))
        assertNull(Inbound.parse("""["t", "pong"]"""))
        assertNull(Inbound.parse("""not json"""))
        assertNull(Inbound.parse(""))
        assertNull(Inbound.parse("""{ "t": "pong" """))
    }

    @Test
    fun unknownFieldsAreIgnored() {
        assertEquals(
            Inbound.Pong,
            Inbound.parse("""{ "t": "pong", "extra": { "nested": [1, 2] } }""")
        )
    }
}

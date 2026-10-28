package cx.lpm.mobile.core.demo

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DemoServerTest {
    @Test
    fun answersEveryVerbTheIosDemoAnswers() = runTest {
        val demo = DemoHarness(this)

        assertEquals(iosVerbs.size, demo.server.verbs.size)
        assertEquals(iosVerbs, demo.server.verbs)
    }

    @Test
    fun acksPushRegistrationsAndAnswers() = runTest {
        val demo = DemoHarness(this)
        assertEquals(
            mapOf("t" to "liveActivity", "ok" to true),
            demo.request("liveActivity", "on" to true).single("liveActivity")
        )
        assertEquals(
            mapOf("t" to "answerAgent", "ok" to true, "reqId" to "r-1"),
            demo.request(
                "answerAgent",
                "project" to "storefront",
                "action" to "allow",
                "reqId" to "r-1"
            ).single("answerAgent")
        )
        assertEquals(
            mapOf("t" to "answerAgent", "ok" to true),
            demo.request("answerAgent", "action" to "deny").single("answerAgent")
        )
    }

    @Test
    fun ignoresUnknownVerbsAndMalformedFrames() = runTest {
        val demo = DemoHarness(this)
        demo.server.receive("""{"t":"nope"}""")
        demo.server.receive("not json")
        demo.server.receive("""["projects"]""")
        demo.server.receive("""{"t":42}""")
        demo.advance(60.0)

        assertTrue(demo.pushed.isEmpty())
    }

    @Test
    fun jsonBridgeCastsLikeSwift() {
        val frame = parseDict(
            """{"i":5,"w":5.0,"f":5.5,"b":true,"n":null,"s":["a","b"],"m":[1,"a"]}"""
        )!!

        assertEquals(5, frame.int("i"))
        assertEquals(5, frame.int("w"))
        assertEquals(null, frame.int("f"))
        assertEquals(1, frame.int("b"))
        assertEquals(null, frame.bool("i"))
        assertEquals(true, parseDict("""{"one":1}""")!!.bool("one"))
        assertEquals(JsonNull, frame["n"])
        assertEquals(null, frame.string("n"))
        assertEquals(listOf("a", "b"), frame.strings("s"))
        assertEquals(null, frame.strings("m"))
        assertEquals(5L, frame["f"].numberValue())
        assertEquals(
            """{"a":62,"b":0.5,"c":null,"d":[true]}""",
            encodeJson(
                mapOf(
                    "a" to 62.0,
                    "b" to 0.5,
                    "c" to null,
                    "d" to listOf(true)
                )
            )
        )
    }

    private val iosVerbs = setOf(
        "projects", "sidebar", "status", "clearStatus", "archiveStatus", "markStatusSeen",
        "markStatusUnread", "duplicateDefaults", "start", "stop",
        "toggleService", "services", "fileChunk", "serviceLogs", "serviceLogsWatch",
        "serviceLogsUnwatch", "renameProject", "setWorkStatus", "remove", "duplicate",
        "createProject", "createSshProject", "cloneProject", "listDirs", "listSshHosts",
        "sidebarCreateFolder", "sidebarRenameFolder", "sidebarDeleteFolder", "sidebarMoveProject",
        "runAction", "runActionBackground", "actionBgOutput", "cancelActionBackground",
        "backgroundRuns", "terminals", "sub", "unsub", "claim", "in", "resize", "newTerminal",
        "closeTerminal", "renameTerminal", "pinTerminal", "reorderTerminals", "restartTerminal",
        "forkTerminal", "forkTerminalCopy", "titleTerminal", "closeOtherTerminals",
        "slash", "mentions",
        "upload", "composerActions", "composerDraft", "transform", "history", "historyAdd", "git",
        "gitDiff", "gitDiffs", "gitCommit", "gitPush", "gitPull", "gitFetch", "gitBranches",
        "gitCheckout", "gitCreateBranch", "gitDiscardAll", "gitGenMessage", "gitGenPr",
        "gitCreatePr", "gitWatch", "gitUnwatch", "gitAuto", "gitAutoState", "gitAutoCancel",
        "gitAutoSwitchBase", "setAutoPull", "gitAutoPullUndo", "claudeAccounts", "setClaudeAccount",
        "ttsSpeak", "stats", "historyQuery", "historySaveDraft", "historyToggleFavorite",
        "historySetFolder", "historyDelete", "historyFolders", "historyCreateFolder",
        "historyDeleteFolder", "jobs", "jobHistory", "markJobSeen", "markAllJobsSeen",
        "jobLiveOutput", "runJob", "stopJob", "setJobEnabled", "jobConfig", "saveJob", "deleteJob",
        "sendJobFollowup", "answerJobQuestion", "dismissJobQuestion",
        "readConfig", "saveConfig", "serviceBody", "saveService",
        "deleteService", "saveProfile", "deleteProfile", "actionBody", "saveAction", "deleteAction",
        "apnsToken", "liveActivity", "answerAgent", "memory", "memorySession", "memorySave",
        "memoryDelete", "notesChats", "notesCreateChat", "notesRenameChat", "notesDeleteChat",
        "notesMessages", "notesAddMessage", "notesEditMessage", "notesDeleteMessage", "notesSearch",
        "notesAttachment", "limits", "uploadBegin", "uploadChunk", "uploadDone", "uploadAbort",
        "weeklyRecap"
    )
}

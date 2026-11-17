package cx.lpm.mobile.core.model

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MiscModelTest {
    private fun obj(json: String): JsonObject = Json.parseToJsonElement(json).jsonObject

    @Test
    fun gitDiffEntryIsAnErrorOrAResult() {
        val failed = GitDiffEntry.parse(
            obj("""{"path": "a.bin", "error": "too big", "diff": "x"}""")
        )
        assertEquals(GitDiffEntry("a.bin", null, "too big"), failed)
        val ok = GitDiffEntry.parse(obj("""{"path": "a.kt", "diff": "@@", "truncated": true}"""))
        assertEquals(
            GitDiffEntry("a.kt", GitDiffResult("@@", binary = false, truncated = true), null),
            ok
        )
    }

    @Test
    fun gitSnapshotDefaults() {
        val s = GitSnapshot.parse(
            obj(
                """{"isRepo": true, "files": [{"path": "README.md"}], "autoPulled": {"count": 1}}"""
            )
        )
        assertEquals("modified", s.files.single().status)
        assertEquals("1 commit", s.autoPulled!!.summary)
        assertNull(GitSnapshot.parse(obj("{}")).autoPulled)
        assertEquals("3 commits on main", AutoPulled(3, "main", "a", "b", 0).summary)
    }

    @Test
    fun gitBranchIds() {
        assertEquals(
            "origin/feat",
            GitBranch.parse(obj("""{"name": "feat", "remote": "origin"}""")).id
        )
        assertFalse(GitBranch.parse(obj("""{"name": "main"}""")).isRemote)
    }

    @Test
    fun gitAutoRunNeedsAKnownKindAndPhase() {
        assertNull(GitAutoRun.parse(obj("""{"kind": "squash", "phase": "running"}""")))
        assertNull(GitAutoRun.parse(obj("""{"kind": "pr", "phase": "paused"}""")))
        val run = GitAutoRun.parse(
            obj(
                """{"runId": 4, "kind": "commitPush", "phase": "done", "rebased": true,
                   "steps": [{"id": "commit", "status": "done", "detail": "Fix"}, {"status": "done"},
                             {"id": "push", "status": "weird"}]}"""
            )
        )!!
        assertEquals(4, run.runId)
        assertFalse(run.running)
        assertEquals(listOf("commit", "push"), run.steps.map { it.id })
        assertEquals(GitAutoStep.Status.Pending, run.steps[1].status)
        assertEquals("Commit changes", run.steps[0].label)
    }

    @Test
    fun gitAutoPlaceholderHasEveryStepPending() {
        val run = GitAutoRun.placeholder(GitAutoKind.Pr)
        assertEquals(0, run.runId)
        assertTrue(run.running)
        assertEquals(listOf("branch", "commit", "push", "pr"), run.steps.map { it.id })
        assertEquals(run.nonce.uppercase(), run.nonce)
        assertNotEquals(run.nonce, GitAutoRun.placeholder(GitAutoKind.Pr).nonce)
    }

    @Test
    fun autoPullResolution() {
        assertEquals(AutoPullMode.Chosen, AutoPullMode.fromWire(obj("""{"m":"chosen"}""")["m"]))
        assertEquals(AutoPullMode.Off, AutoPullMode.fromWire(obj("""{"m":"ALL"}""")["m"]))
        assertEquals(AutoPullMode.Off, AutoPullMode.fromWire(null))
        val parent = Project.parse(obj("""{"name": "p", "autoPull": true}"""))
        assertFalse(autoPullEnabled(own = true, parent = parent, mode = AutoPullMode.Off))
        assertTrue(autoPullEnabled(own = null, parent = parent, mode = AutoPullMode.Chosen))
        assertFalse(autoPullEnabled(own = false, parent = parent, mode = AutoPullMode.All))
        assertTrue(autoPullEnabled(own = null, parent = null, mode = AutoPullMode.All))
        assertFalse(autoPullEnabled(own = null, parent = null, mode = AutoPullMode.Chosen))
    }

    @Test
    fun limitsSnapshotKeepsOnlyAPlausibleClock() {
        val snap = LimitsSnapshot.parse(
            obj(
                """{"limits": {"codex": {"provider": "codex", "label": "pro", "weekly": {"usedPercent": 104.5},
                                         "updatedAt": 1760000000000, "noFiveHour": true},
                              "claude:default": {"provider": "claude", "accountId": "default",
                                                 "fiveHour": {"usedPercent": 72, "resetsAt": 1760003600}},
                              "junk": 3},
                    "claudeEnabled": true, "now": 1760000001000}"""
            )
        )
        assertEquals(setOf("codex", "claude:default"), snap.entries.keys)
        assertEquals(104.5, snap.entries.getValue("codex").weekly!!.usedPercent, 0.0)
        assertEquals(0L, snap.entries.getValue("codex").weekly!!.resetsAt)
        assertNull(snap.entries.getValue("codex").fiveHour)
        assertTrue(snap.entries.getValue("codex").noFiveHour)
        assertFalse(snap.entries.getValue("claude:default").noFiveHour)
        assertEquals(1_760_003_600L, snap.entries.getValue("claude:default").fiveHour!!.resetsAt)
        assertEquals(1_760_000_001_000.0, snap.nowMs!!, 0.0)
        assertTrue(snap.claudeEnabled)
        assertNull(LimitsSnapshot.parse(obj("""{"now": 1760000001}""")).nowMs)
        assertNull(LimitsSnapshot.parse(obj("""{"now": 0}""")).nowMs)
        assertTrue(LimitWindow.parse(obj("{}")).usedPercent.isNaN())
    }

    @Test
    fun agentStatsReadLargeAndFractionalCounts() {
        val stats = AgentStats.parse(
            obj(
                """{"generatedAt": 1760000000000, "days": 7, "sessions": 12.9,
                   "totals": {"inputTokens": 5000000000, "outputTokens": 1.5e3},
                   "models": [{"key": "opus", "provider": "claude", "fast": true, "tokens": {"totalTokens": 9}}],
                   "daily": [{"date": "2026-10-14", "claudeTokens": 3}],
                   "recentSessions": [{"provider": "claude", "project": "p", "model": "m", "startedAt": 1, "lastAt": 2}],
                   "sources": [{"provider": "codex", "files": 4}]}"""
            )
        )
        assertEquals(12, stats.sessions)
        assertEquals(5_000_000_000L, stats.totals.inputTokens)
        assertEquals(1500L, stats.totals.outputTokens)
        assertEquals("opus#fast", stats.models.single().id)
        assertEquals(9L, stats.models.single().tokens.totalTokens)
        assertEquals("2026-10-14", stats.daily.single().id)
        assertEquals("claude\np\nm\n1", stats.recentSessions.single().id)
        assertEquals(4, stats.sources.single().files)
        assertTrue(stats.providers.isEmpty())
    }

    @Test
    fun fileChunkDecodesOrExplains() {
        val ok = FileChunk.parse(
            obj(
                """{"ok": true, "reqId": 9, "path": "/a", "size": 3, "mtime": 1760000000000, "data": "aGk="}"""
            )
        )
        assertArrayEquals("hi".toByteArray(), ok.data)
        assertEquals("9", ok.reqId)
        assertEquals(1_760_000_000_000L, ok.mtime)
        assertNull(ok.error)
        assertEquals(
            "Couldn't read the file.",
            FileChunk.parse(obj("""{"ok": true, "data": "@@@"}""")).error
        )
        val missing = FileChunk.parse(obj("""{"ok": false, "missing": true}"""))
        assertTrue(missing.missing)
        assertEquals("Couldn't read the file.", missing.error)
        assertEquals(
            "denied",
            FileChunk.parse(obj("""{"ok": false, "error": "denied", "data": "aGk="}""")).error
        )
        assertEquals(0, FileChunk.parse(obj("""{"ok": false, "data": "aGk="}""")).data.size)
    }

    @Test
    fun macUpdateFrames() {
        assertNull(MacBuild.parse(obj("""{"version": ""}""")))
        assertEquals(
            MacBuild("0.6.12", selfUpdate = true),
            MacBuild.parse(obj("""{"version": "0.6.12", "selfUpdate": true}"""))
        )
        assertEquals(
            MacUpdateStep(MacUpdateStep.Phase.Idle, -1),
            MacUpdateStep.parse(obj("""{"phase": "?"}"""))
        )
        val failed = MacUpdateCheck.parse(
            obj(
                """{"ok": false, "currentVersion": "1", "updateAvail": true, "phase": "downloading", "progress": 40}"""
            )
        )
        assertEquals("The check didn't go through.", failed.error)
        assertNull(failed.currentVersion)
        assertFalse(failed.updateAvailable)
        assertEquals(MacUpdateStep(MacUpdateStep.Phase.Downloading, 40), failed.step)
    }

    @Test
    fun machinesTrimAndDefault() {
        val m = RemoteMachine.parse(
            obj("""{"slug": "box", "platform": " linux ", "serverId": "", "state": "zzz"}""")
        )
        assertEquals("linux", m.platform)
        assertTrue(m.isLinuxHost)
        assertNull(m.serverId)
        assertEquals(RemoteMachine.State.Offline, m.state)
        assertFalse(m.isConnected)
        assertNull(m.projects)
        assertEquals(
            1,
            RemoteMachine.parse(obj("""{"projects": [{"name": "a"}]}""")).projects!!.size
        )
        val offer = MachinePairOffer.parse(
            obj("""{"slug": "box", "code": "AB12", "port": 0, "fingerprint": " ab "}""")
        )
        assertEquals(DEFAULT_MAC_PORT, offer.port)
        assertEquals("ab", offer.fingerprint)
        assertEquals(9000, MachinePairOffer.parse(obj("""{"port": 9000}""")).port)
    }

    @Test
    fun memoryOwnerIsTheDirsLastComponent() {
        assertEquals(
            "storefront",
            MemoryList(true, "/Users/me/.lpm/memory/storefront", emptyList()).owner
        )
        assertEquals(
            "storefront",
            MemoryList(true, "/Users/me/.lpm/memory/storefront/", emptyList()).owner
        )
        assertEquals("/", MemoryList(true, "/", emptyList()).owner)
    }

    @Test
    fun notesKeepAbsentOptionalsAbsent() {
        val m = NoteMessage.parse(
            obj("""{"id": "m1", "chatId": "c1", "ts": 1760000000000, "text": "hi"}""")
        )
        assertNull(m.editedAt)
        assertNull(m.attachments)
        val withFiles = NoteMessage.parse(
            obj(
                """{"attachments": [{"hash": "h", "name": "a.png", "size": 3, "mimeType": "image/png"}]}"""
            )
        )
        assertEquals("h", withFiles.attachments!!.single().id)
    }

    @Test
    fun historyItemDefaults() {
        val item = HistoryItem.parse(
            obj("""{"id": "h1", "images": {"[Image 1]": "/tmp/a.png"}, "folder": null}""")
        )
        assertEquals("sent", item.kind)
        assertFalse(item.isDraft)
        assertNull(item.folder)
        assertEquals(mapOf("[Image 1]" to "/tmp/a.png"), item.images)
        assertFalse(item.isFromOtherComputer)
        assertEquals("Folder", HistoryFolder.parse(obj("{}")).name)
    }

    @Test
    fun historyItemFromAnotherComputer() {
        val item = HistoryItem.parse(
            obj("""{"id": "peer-0a1b2c3d-h1", "machine": "0a1b2c3d", "machineName": "MacBook"}""")
        )
        assertTrue(item.isFromOtherComputer)
        assertEquals("0a1b2c3d", item.machine)
        assertEquals("MacBook", item.machineName)
    }

    @Test
    fun uploadStepReadsSizesAndReqId() {
        val step = UploadStep.parse(
            obj("""{"id": "t1", "reqId": "r", "ok": true, "uploadId": "u", "chunk": 1048576}""")
        )
        assertEquals(UploadStep("t1", "r", true, null, "u", 1_048_576, 0, ""), step)
    }
}

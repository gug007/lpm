package cx.lpm.mobile.core.data.git

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.testing.FakeSocket
import cx.lpm.mobile.core.data.testing.SessionHarness
import cx.lpm.mobile.core.data.testing.settleAlive
import cx.lpm.mobile.core.model.GitConflictOp
import cx.lpm.mobile.core.model.GitConflictSide
import cx.lpm.mobile.core.model.string
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class GitConflictsTest {
    private class Fixture(val h: SessionHarness, val socket: FakeSocket) {
        val store: GitStore = h.session.store()
        val state: GitState get() = store.state.value

        fun receive(frame: String) {
            socket.receive(frame)
            h.scheduler.runCurrent()
        }

        fun snapshot(resolved: Boolean = false, resolving: String = "") = receive(
            """{"t":"git","project":"api","ok":true,"isRepo":true,"branch":"main","files":[],""" +
                """"merge":{"merging":true,"source":"feat",$resolving"files":[""" +
                """{"path":"a.ts","conflicts":1,"firstLine":3,"resolved":$resolved}]}}"""
        )
    }

    private fun TestScope.ready(): Fixture {
        val h = SessionHarness(this)
        val socket = h.connectReady(features = listOf(LpmClient.GIT_CONFLICTS_FEATURE))
        return Fixture(h, socket).also { it.store.watch("api") }
    }

    @Test
    fun `a side is taken and remembered, and the snapshot asked for again`() = runTest {
        val f = ready()
        assertTrue(f.store.canResolveConflicts)
        f.snapshot()
        f.store.runConflictOp("api", GitConflictOp.Take("a.ts", GitConflictSide.Theirs))
        f.store.runConflictOp("api", GitConflictOp.Abort)
        assertEquals(0, f.socket.sentOf("gitMergeAbort").size)
        val sent = f.socket.sentOf("gitConflictTake").single()
        assertEquals("theirs", sent.string("side"))
        f.receive("""{"t":"gitConflictTake","project":"api","ok":true}""")
        assertNull(f.state.conflictOps["api"])
        assertEquals(mapOf("a.ts" to GitConflictSide.Theirs), f.state.conflictSides["api"])
        assertEquals(1, f.socket.sentOf("git").size)
    }

    @Test
    fun `what the Mac refuses is said, and one that never answers gives up`() = runTest {
        val f = ready()
        f.store.runConflictOp("api", GitConflictOp.Commit("feat"))
        f.receive("""{"t":"gitMergeContinue","project":"api","ok":false,"error":"hook failed"}""")
        assertEquals(
            GitOpError("Couldn't continue the merge", "hook failed"),
            f.state.opError["api"]
        )
        f.store.runConflictOp("api", GitConflictOp.Stop)
        settleAlive(f.socket, 31_000)
        assertEquals("Couldn't stop", f.state.opError["api"]?.title)
        assertNull(f.state.conflictOps["api"])
    }

    @Test
    fun `an action the mac can't hear now is never sent later`() = runTest {
        val f = ready()
        f.socket.fail()
        f.h.scheduler.runCurrent()
        f.store.runConflictOp("api", GitConflictOp.Abort)
        assertNull(f.state.conflictOps["api"])
        assertEquals(
            GitOpError("Couldn't abort the merge", "Lost the connection to the Mac."),
            f.state.opError["api"]
        )
        val again = f.h.connectReady(features = listOf(LpmClient.GIT_CONFLICTS_FEATURE))
        assertEquals(0, again.sentOf("gitMergeAbort").size)
    }

    @Test
    fun `a late reply doesn't settle what was asked since`() = runTest {
        val f = ready()
        f.store.runConflictOp("api", GitConflictOp.Stop)
        settleAlive(f.socket, 31_000)
        f.store.runConflictOp("api", GitConflictOp.Abort)
        f.receive("""{"t":"gitMergeStop","project":"api","ok":true}""")
        assertEquals(GitConflictOp.Abort, f.state.conflictOps["api"])
        f.receive("""{"t":"gitMergeAbort","project":"api","ok":true}""")
        assertNull(f.state.conflictOps["api"])
    }

    @Test
    fun `a committed merge says what went into what`() = runTest {
        val f = ready()
        f.snapshot(resolved = true)
        f.store.runConflictOp("api", GitConflictOp.Commit("feat"))
        f.receive("""{"t":"gitMergeContinue","project":"api","ok":true}""")
        assertEquals("Merged feat into main", f.state.notice["api"]?.text)
    }

    @Test
    fun `a run is followed and its end told to the phone showing it`() = runTest {
        val f = ready()
        f.receive("""{"t":"gitMergeRun","project":"api","running":true,"line":"Reading a.ts"}""")
        assertEquals("Reading a.ts", f.state.resolvingConflicts["api"])
        f.receive(
            """{"t":"gitMergeRun","project":"api","running":false,"left":0,"merging":true}"""
        )
        assertFalse("api" in f.state.resolvingConflicts)
        assertEquals("Conflicts resolved. Continue the merge.", f.state.notice["api"]?.text)

        f.receive(
            """{"t":"gitMergeRun","project":"api","running":false,"left":2,"merging":true}"""
        )
        assertEquals("2 files still have conflicts.", f.state.opError["api"]?.message)
        f.receive("""{"t":"gitMergeRun","project":"web","running":false,"error":"no CLI"}""")
        assertNull(f.state.opError["web"])
    }

    @Test
    fun `a snapshot tells of a run whose start or end was missed`() = runTest {
        val f = ready()
        f.snapshot(resolving = """"resolving":{"line":"Reading a.ts"},""")
        assertEquals("Reading a.ts", f.state.resolvingConflicts["api"])
        f.snapshot()
        assertFalse("api" in f.state.resolvingConflicts)
    }

    @Test
    fun `a pull that fails asks for the snapshot, which may list conflicts`() = runTest {
        val f = ready()
        f.store.pull("api")
        f.receive("""{"t":"gitPull","project":"api","ok":false,"error":"The pull stopped"}""")
        assertEquals("Pull failed", f.state.opError["api"]?.title)
        assertEquals(1, f.socket.sentOf("git").size)
    }
}

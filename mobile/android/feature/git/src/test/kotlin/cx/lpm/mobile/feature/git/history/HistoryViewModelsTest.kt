package cx.lpm.mobile.feature.git.history

import cx.lpm.mobile.core.data.git.GitHistoryStore
import cx.lpm.mobile.core.data.git.GitStore
import cx.lpm.mobile.core.data.prefs.PreferenceKeys
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.CommitFile
import cx.lpm.mobile.core.model.HistoryCommit
import cx.lpm.mobile.core.navigation.GitCommitFileKey
import cx.lpm.mobile.core.navigation.GitCommitKey
import cx.lpm.mobile.core.navigation.GitHistoryKey
import cx.lpm.mobile.core.testing.FakeSocket
import cx.lpm.mobile.core.testing.MainDispatcherRule
import cx.lpm.mobile.core.testing.TestSession
import cx.lpm.mobile.core.testing.keepCollecting
import cx.lpm.mobile.feature.git.diff.DiffBlockKind
import cx.lpm.mobile.feature.git.settle
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class HistoryViewModelsTest {
    @get:Rule
    val main = MainDispatcherRule()

    private fun TestScope.connected(): Pair<TestSession, FakeSocket> {
        val t = TestSession(
            this,
            setOf(SessionStore.Factory(::GitStore), SessionStore.Factory(::GitHistoryStore))
        )
        val socket = t.connectReady(features = listOf("gitHistory"))
        return t to socket
    }

    private fun commit(hash: String, unpushed: Boolean) =
        """{ "hash": "$hash", "subject": "Commit $hash", "author": "Alex Kim", "time": 1760000000,
             "parents": 1, "coAuthors": [], "unpushed": $unpushed }"""

    @Test
    fun `history lists a page, marks where pushed commits start and appends older ones`() =
        runTest {
            val (t, socket) = connected()
            val vm = CommitHistoryViewModel(GitHistoryKey("storefront"), t.sessions, t.clock)
            keepCollecting(vm.uiState)
            assertTrue(vm.uiState.value.ready)

            vm.loadOnce()
            t.scheduler.runCurrent()
            val asked = socket.sentOf("gitHistory").single()
            assertEquals(0, asked["skip"]!!.jsonPrimitive.int)
            assertEquals(100, asked["limit"]!!.jsonPrimitive.int)
            assertTrue(vm.uiState.value.loading)

            socket.receive(
                """{ "t": "gitHistory", "project": "storefront", "skip": 0, "ok": true, "hasMore": true,
                 "commits": [${commit("aaaaaaa1", true)}, ${commit("bbbbbbb2", false)}] }"""
            )
            t.scheduler.runCurrent()
            var state = vm.uiState.value
            assertEquals(listOf("aaaaaaa", "bbbbbbb"), state.commits.map { it.short })
            assertEquals(1, state.boundary)
            assertEquals(1, state.unpushed)
            assertFalse(state.unpushedMore)
            assertTrue(state.hasMore)
            assertFalse(state.loading)

            vm.loadMore()
            t.scheduler.runCurrent()
            assertEquals(2, socket.sentOf("gitHistory").last()["skip"]!!.jsonPrimitive.int)
            socket.receive(
                """{ "t": "gitHistory", "project": "storefront", "skip": 2, "ok": true, "hasMore": false,
                 "commits": [${commit("ccccccc3", false)}] }"""
            )
            t.scheduler.runCurrent()
            state = vm.uiState.value
            assertEquals(3, state.commits.size)
            assertFalse(state.hasMore)

            // Back from a commit: the visit already asked, so the older pages stay.
            vm.loadOnce()
            t.scheduler.runCurrent()
            assertEquals(2, socket.sentOf("gitHistory").size)
            assertEquals(3, vm.uiState.value.commits.size)
        }

    @Test
    fun `a history the Mac never answers says so`() = runTest {
        val (t, _) = connected()
        val vm = CommitHistoryViewModel(GitHistoryKey("storefront"), t.sessions, t.clock)
        keepCollecting(vm.uiState)
        vm.load()
        t.settle(31_000)
        assertEquals("The Mac didn't answer in time.", vm.uiState.value.error)
        assertFalse(vm.uiState.value.loading)
    }

    @Test
    fun `a commit's files load, and a refusal shows its error`() = runTest {
        val (t, socket) = connected()
        val c =
            HistoryCommit("abc1234def", "abc1234", "Fix", "", "Sam", "", 0, 1, emptyList(), false)
        val vm = CommitDetailViewModel(GitCommitKey("storefront", c), t.sessions)
        keepCollecting(vm.uiState)
        vm.loadFiles()
        t.scheduler.runCurrent()
        assertEquals(
            "abc1234def",
            socket.sentOf("gitCommitFiles").single()["hash"].toString().trim('"')
        )
        assertNull(vm.uiState.value.files)
        assertNull(vm.uiState.value.error)
        socket.receive(
            """{ "t": "gitCommitFiles", "project": "storefront", "hash": "abc1234def", "ok": false,
                 "error": "abc1234def is not a commit" }"""
        )
        t.scheduler.runCurrent()
        assertEquals("abc1234def is not a commit", vm.uiState.value.error)
        vm.loadFiles()
        socket.receive(
            """{ "t": "gitCommitFiles", "project": "storefront", "hash": "abc1234def", "ok": true,
                 "files": [{ "path": "a.ts", "status": "modified", "added": 1, "removed": 1 }] }"""
        )
        t.scheduler.runCurrent()
        assertEquals(listOf("a.ts"), vm.uiState.value.files?.map { it.path })
        assertNull(vm.uiState.value.error)
    }

    @Test
    fun `a renamed file's patch asks with where it came from and parses`() = runTest {
        val (t, socket) = connected()
        val file = CommitFile("app/cart/page.tsx", "app/cart.tsx", "renamed", 1, 1)
        val vm = CommitFileDiffViewModel(
            GitCommitFileKey("storefront", "abc", file),
            t.sessions,
            t.prefs,
            StandardTestDispatcher(testScheduler)
        )
        keepCollecting(vm.uiState)
        assertTrue(vm.uiState.value.wrap)
        vm.load()
        t.scheduler.runCurrent()
        val asked = socket.sentOf("gitCommitPatch").single()
        assertEquals("\"app/cart.tsx\"", asked["oldPath"].toString())
        socket.receive(
            """{ "t": "gitCommitPatch", "project": "storefront", "hash": "abc", "path": "app/cart/page.tsx",
                 "ok": true, "diff": "@@ -1,1 +1,1 @@\n-a\n+b\n", "truncated": true }"""
        )
        t.scheduler.runCurrent()
        val state = vm.uiState.value
        assertEquals(true, state.patch.result?.truncated)
        assertEquals(DiffBlockKind.Hunk, state.parsed?.blocks?.first()?.kind)

        vm.toggleWrap()
        t.scheduler.runCurrent()
        assertFalse(vm.uiState.value.wrap)
        assertEquals(false, t.prefs.bool(PreferenceKeys.GIT_REVIEW_WRAP))
    }
}

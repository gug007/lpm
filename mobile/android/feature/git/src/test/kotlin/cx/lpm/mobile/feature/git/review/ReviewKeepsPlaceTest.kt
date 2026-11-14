package cx.lpm.mobile.feature.git.review

import cx.lpm.mobile.core.navigation.GitReviewKey
import cx.lpm.mobile.core.testing.FakeSocket
import cx.lpm.mobile.core.testing.MainDispatcherRule
import cx.lpm.mobile.core.testing.TestSession
import cx.lpm.mobile.core.testing.keepCollecting
import cx.lpm.mobile.feature.git.ReviewStores
import cx.lpm.mobile.feature.git.data.CommitDraft
import cx.lpm.mobile.feature.git.data.ReviewDraftsStore
import cx.lpm.mobile.feature.git.demoSession
import cx.lpm.mobile.feature.git.settle
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** Changes keeps your place: the commit being written, what was viewed, and a focused file. */
class ReviewKeepsPlaceTest {
    @get:Rule
    val main = MainDispatcherRule()

    private fun TestScope.review(t: TestSession, focus: String? = null): GitReviewViewModel {
        val vm = GitReviewViewModel(
            GitReviewKey("storefront", focus = focus),
            t.sessions,
            t.prefs,
            StandardTestDispatcher(testScheduler)
        )
        keepCollecting(vm.uiState)
        vm.appear()
        t.settle()
        return vm
    }

    private fun GitReviewViewModel.header(path: String) =
        uiState.value.rows.filterIsInstance<ReviewRow.FileHeader>().single { it.path == path }

    private fun FakeSocket.snapshot() = receive(
        """{"t":"git","ok":true,"project":"storefront","isRepo":true,"branch":"main",""" +
            """"files":[{"path":"src/a.ts","status":"modified","stamp":"1"}]}"""
    )

    private fun FakeSocket.diff(text: String) = receive(
        """{"t":"gitDiffs","ok":true,"project":"storefront","files":[""" +
            """{"path":"src/a.ts","diff":"$text","binary":false,"truncated":false}]}"""
    )

    @Test
    fun `the commit being written outlives leaving Changes until it's cleared`() = runTest {
        val t = demoSession()
        val first = review(t)
        first.setMessage("\nfix(checkout): keep the draft\n\nWhy it matters")
        first.toggleSelected("app/checkout/page.tsx")
        first.disappear()

        val back = review(t)
        var state = back.uiState.value
        assertEquals("\nfix(checkout): keep the draft\n\nWhy it matters", state.message)
        assertEquals(3, state.selectedCount)
        assertFalse(back.header("app/checkout/page.tsx").selected)
        assertEquals(DraftChip("fix(checkout): keep the draft", listOf("page.tsx")), state.draft)

        back.clearDraft()
        t.settle(0)
        state = back.uiState.value
        assertNull(state.draft)
        assertEquals("", state.message)
        assertEquals(4, state.selectedCount)
    }

    @Test
    fun `a commit that lands clears the draft`() = runTest {
        val t = demoSession()
        val vm = review(t)
        vm.setMessage("fix: x")
        vm.toggleSelected("README.md")
        t.settle(0)
        assertEquals(DraftChip("fix: x", listOf("README.md")), vm.uiState.value.draft)
        vm.commit()
        t.settle(2_000)
        assertNull(vm.uiState.value.draft)
        assertEquals(CommitDraft(), t.store<ReviewDraftsStore>().state.value.draft("storefront"))
    }

    @Test
    fun `an empty message with nothing left out keeps no draft`() = runTest {
        val t = demoSession()
        val vm = review(t)
        vm.setMessage("  ")
        t.settle(0)
        assertNull(vm.uiState.value.draft)
        vm.selectAll(false)
        t.settle(0)
        assertEquals(
            DraftChip(null, listOf("CheckoutForm.tsx", "page.tsx", "payments.ts", "README.md")),
            vm.uiState.value.draft
        )
    }

    @Test
    fun `a viewed file whose diff changes loses Viewed and opens back up`() = runTest {
        val t = TestSession(this, ReviewStores)
        val socket = t.connectReady()
        val vm = review(t)
        socket.snapshot()
        socket.diff("@@ -1 +1 @@\\n-a\\n+b\\n")
        t.settle()
        vm.toggleViewed("src/a.ts")
        t.settle(0)
        assertTrue(vm.header("src/a.ts").viewed)
        assertTrue(vm.header("src/a.ts").collapsed)

        socket.diff("@@ -1 +1 @@\\n-a\\n+b\\n")
        t.settle(0)
        assertTrue("the same diff again is still the one seen", vm.header("src/a.ts").viewed)

        socket.diff("@@ -1 +1 @@\\n-a\\n+c\\n")
        t.settle(0)
        var header = vm.header("src/a.ts")
        assertFalse(header.viewed)
        assertFalse(header.collapsed)
        assertNotNull(header.changedSince)
        assertEquals(ReviewRow.Summary(total = 1, viewed = 0), vm.uiState.value.rows.first())

        vm.toggleViewed("src/a.ts")
        t.settle(0)
        header = vm.header("src/a.ts")
        assertTrue(header.viewed)
        assertNull(header.changedSince)
    }

    @Test
    fun `a file marked before its diff loaded is judged from the first diff that arrives`() =
        runTest {
            val t = TestSession(this, ReviewStores)
            val socket = t.connectReady()
            val vm = review(t)
            socket.snapshot()
            t.settle(0)
            vm.toggleViewed("src/a.ts")
            socket.diff("@@ -1 +1 @@\\n-a\\n+b\\n")
            t.settle()
            assertTrue(vm.header("src/a.ts").viewed)
            assertNull(vm.header("src/a.ts").changedSince)

            socket.diff("@@ -1 +1 @@\\n-a\\n+c\\n")
            t.settle(0)
            assertFalse(vm.header("src/a.ts").viewed)
            assertNotNull(vm.header("src/a.ts").changedSince)
        }

    @Test
    fun `opened on a file, Changes expands it and scrolls there once`() = runTest {
        val t = demoSession()
        t.store<ReviewDraftsStore>().toggleViewed("storefront", "README.md")
        val vm = review(t, focus = "README.md")
        assertEquals("README.md", vm.uiState.value.focus)
        val readme = vm.header("README.md")
        assertTrue(readme.viewed)
        assertFalse("opened on, it shows its diff though viewed", readme.collapsed)

        vm.focusShown()
        t.settle(0)
        assertNull(vm.uiState.value.focus)
        assertNull(review(t).uiState.value.focus)
    }
}

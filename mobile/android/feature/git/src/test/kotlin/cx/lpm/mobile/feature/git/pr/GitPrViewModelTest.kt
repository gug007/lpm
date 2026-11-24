package cx.lpm.mobile.feature.git.pr

import cx.lpm.mobile.core.data.git.GitStore
import cx.lpm.mobile.core.navigation.GitPullRequestKey
import cx.lpm.mobile.core.testing.MainDispatcherRule
import cx.lpm.mobile.core.testing.keepCollecting
import cx.lpm.mobile.feature.git.demoSession
import cx.lpm.mobile.feature.git.settle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class GitPrViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    @Test
    fun `the AI drafts the pull request, then Create opens it`() = runTest {
        val t = demoSession()
        val vm = GitPrViewModel(GitPullRequestKey("storefront"), t.sessions)
        keepCollecting(vm.uiState)
        assertFalse("no title yet", vm.uiState.value.canCreate)

        vm.generate()
        t.settle(0)
        assertTrue(vm.uiState.value.generating)
        assertFalse(vm.uiState.value.canCreate)
        t.settle(2_000)
        val drafted = vm.uiState.value
        assertEquals("Redesign the checkout flow", drafted.title)
        assertTrue(drafted.body.startsWith("## Summary\n- Update `components/CheckoutForm.tsx`"))
        assertTrue(drafted.canCreate)

        vm.setTitle("Checkout redesign")
        vm.create()
        t.settle(0)
        assertTrue(vm.uiState.value.creating)
        t.settle(2_000)
        assertEquals("https://github.com/demo/storefront/pull/42", vm.uiState.value.createdUrl)
        assertNull(vm.uiState.value.error)
    }

    @Test
    fun `a branch started from an issue closes it unless switched off`() = runTest {
        val t = demoSession()
        val vm = GitPrViewModel(GitPullRequestKey("storefront"), t.sessions)
        keepCollecting(vm.uiState)
        assertNull("not known before the snapshot", vm.uiState.value.issue)

        t.session.store<GitStore>().load("storefront")
        t.settle(1_000)
        assertEquals(38, vm.uiState.value.issue)
        assertTrue(vm.uiState.value.closeIssue)

        vm.setCloseIssue(false)
        t.settle(0)
        assertFalse(vm.uiState.value.closeIssue)
    }
}

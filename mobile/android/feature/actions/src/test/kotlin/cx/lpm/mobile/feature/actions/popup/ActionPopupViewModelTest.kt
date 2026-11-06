package cx.lpm.mobile.feature.actions.popup

import cx.lpm.mobile.core.data.actions.ActionPopupPhase
import cx.lpm.mobile.core.data.actions.ActionPopupStore
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.testing.MainDispatcherRule
import cx.lpm.mobile.feature.actions.demoAction
import cx.lpm.mobile.feature.actions.demoSession
import cx.lpm.mobile.feature.actions.settle
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class ActionPopupViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    @Test
    fun `the demo's Stars popup opens on its sample page`() = runTest {
        val t = demoSession()
        val stars = t.demoAction("api-gateway", "stars")
        val vm = ActionPopupViewModel("api-gateway", stars, SessionKey.Live, t.sessions)
        backgroundScope.launch { vm.uiState.collect() }
        assertEquals(ActionPopupPhase.Loading, vm.uiState.value.popup.phase)
        assertEquals("GitHub stars", vm.uiState.value.title)
        assertEquals(200, vm.uiState.value.height)

        t.settle()
        val content = checkNotNull(vm.uiState.value.popup.content)
        assertTrue(content.html.orEmpty().contains("<title>GitHub stars</title>"))
        assertEquals(
            "1396",
            content.data.toString().substringAfter("\"total\":").substringBefore(",")
        )
        assertEquals(1, vm.uiState.value.popup.page)

        assertTrue("the demo stamps when it made the data", content.updatedAt > 0)

        vm.reload()
        assertTrue("the page stays while it refreshes", vm.uiState.value.popup.inFlight)
        assertEquals(content, vm.uiState.value.popup.content)
        t.settle()
        assertEquals("Refresh loads the page again", 2, vm.uiState.value.popup.page)
    }

    @Test
    fun `an action without a popup asks nothing`() = runTest {
        val t = demoSession()
        val test = t.demoAction("api-gateway", "test")
        val vm = ActionPopupViewModel("api-gateway", test, SessionKey.Live, t.sessions)
        backgroundScope.launch { vm.uiState.collect() }
        t.settle()
        assertTrue(t.store<ActionPopupStore>().state.value.popups.isEmpty())
        assertEquals("Test", vm.uiState.value.title)
    }
}

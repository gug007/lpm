package cx.lpm.mobile.feature.actions.sheet

import cx.lpm.mobile.core.data.actions.ActionMemory
import cx.lpm.mobile.core.data.prefs.PreferenceKeys
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.navigation.ProjectActionsKey
import cx.lpm.mobile.core.testing.MainDispatcherRule
import cx.lpm.mobile.feature.actions.demoSession
import cx.lpm.mobile.feature.actions.layout.ActionRowItem
import cx.lpm.mobile.feature.actions.run.ActionPicks
import cx.lpm.mobile.feature.actions.settle
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class ProjectActionsViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    @Test
    fun `the storefront's actions sit in its zones, and a layer shown is remembered`() = runTest {
        val t = demoSession()
        val picks = ActionPicks()
        val vm =
            ProjectActionsViewModel(
                ProjectActionsKey("storefront"),
                t.sessions,
                ActionMemory(t.prefs),
                picks
            )
        backgroundScope.launch { vm.uiState.collect() }
        t.settle()
        val state = vm.uiState.value
        val frames = state.rows.header.filterIsInstance<ActionRowItem.Frame>()
        assertEquals(listOf("Checks", "Agents"), frames.map { it.zone.label })
        assertEquals(listOf("Test", "Lint"), frames[0].lists.single().actions.map { it.label })
        val agents = frames[1]
        assertEquals(listOf("Claude", "Codex"), agents.lists.map { it.title })
        assertEquals(0, state.openIndex("agents", agents.lists))
        assertTrue(state.rows.footer.isEmpty() && state.rows.menu.isEmpty())
        assertTrue("the demo Mac makes action popups", state.popups)

        vm.showLayer("agents", "codex")
        t.settle()
        assertEquals(1, vm.uiState.value.openIndex("agents", agents.lists))
        assertEquals(
            """{"storefront/agents":"codex"}""",
            t.prefs.string(PreferenceKeys.ZONE_OPEN_LAYERS)
        )

        vm.rememberChild("deploy", "prod")
        t.settle()
        assertEquals("prod", vm.uiState.value.memory.lastUsed("storefront", "deploy"))

        vm.pick(agents.lists[1].actions.single())
        assertEquals("codex-review", picks.pending(SessionKey.Live, "storefront").first()?.name)
    }
}

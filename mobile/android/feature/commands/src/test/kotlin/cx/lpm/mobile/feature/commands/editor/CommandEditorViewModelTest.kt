package cx.lpm.mobile.feature.commands.editor

import cx.lpm.mobile.core.model.CommandRef
import cx.lpm.mobile.core.model.CommandScope
import cx.lpm.mobile.core.model.Haptic
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.navigation.CommandEditorKey
import cx.lpm.mobile.core.testing.MainDispatcherRule
import cx.lpm.mobile.core.testing.TestSession
import cx.lpm.mobile.feature.commands.commands
import cx.lpm.mobile.feature.commands.demoSession
import cx.lpm.mobile.feature.commands.folder.editorKey
import cx.lpm.mobile.feature.commands.settle
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class CommandEditorViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private fun TestScope.editor(t: TestSession, key: CommandEditorKey): CommandEditorViewModel {
        val vm = CommandEditorViewModel(key, t.sessions)
        backgroundScope.launch { vm.uiState.collect {} }
        vm.watch.open()
        t.settle()
        return vm
    }

    @Test
    fun `save as command seeds a new one in the project's own list`() = runTest {
        val t = demoSession()
        val vm = editor(t, CommandEditorKey("storefront", body = "Ship the release"))
        val state = vm.uiState.value
        assertTrue(state.isNew)
        assertEquals(CommandScope.Project, state.draft.scope)
        assertNull(state.draft.folder)
        assertEquals("Ship the release", state.draft.body)
        assertFalse(state.canSave)
        assertEquals(
            listOf(
                PlaceGroup(CommandScope.Project, listOf("Bugs", "Review")),
                PlaceGroup(CommandScope.Global, listOf("Git", "Testing"))
            ),
            state.places
        )
    }

    @Test
    fun `a name takes dashes for spaces and Save writes the command`() = runTest {
        val t = demoSession()
        val vm = editor(t, CommandEditorKey("storefront", body = "Ship the release"))
        vm.setName("ship  it")
        vm.setDescription("  Ships  ")
        vm.place(CommandScope.Global, "Git")
        assertEquals("ship-it", vm.uiState.value.draft.name)
        assertTrue(vm.uiState.value.canSave)
        vm.save()
        assertTrue(vm.uiState.value.saving)
        t.settle()
        val state = vm.uiState.value
        assertTrue(state.done)
        assertEquals(Haptic.Success, state.feedback?.haptic)
        val saved = t.commands.state.value.lists.getValue("storefront").global.commands
            .single { it.name == "ship-it" }
        assertEquals("Git", saved.folder)
        assertEquals("Ships", saved.description)
    }

    @Test
    fun `a name the list has shows the Mac's refusal`() = runTest {
        val t = demoSession()
        val vm = editor(t, CommandEditorKey("storefront", body = "x"))
        vm.setName("review-changes")
        vm.save()
        t.settle()
        val state = vm.uiState.value
        assertFalse(state.done)
        assertFalse(state.saving)
        assertEquals("/review-changes already exists in the Review folder.", state.error)
        assertEquals(Haptic.Error, state.feedback?.haptic)
    }

    @Test
    fun `editing moves the command and Delete removes it`() = runTest {
        val t = demoSession()
        val original = CommandRef(CommandScope.Project, "Bugs", "fix-ticket")
        val key = CommandEditorKey(
            "storefront",
            original = original,
            scope = CommandScope.Project,
            folder = "Bugs",
            name = "fix-ticket",
            body = "Fix {{ticket}}"
        )
        val vm = editor(t, key)
        assertFalse(vm.uiState.value.isNew)
        vm.place(CommandScope.Project, "Review")
        vm.save()
        t.settle()
        val project = t.commands.state.value.lists.getValue("storefront").project!!
        assertEquals("Review", project.commands.single { it.name == "fix-ticket" }.folder)

        val moved =
            editor(t, key.copy(original = original.copy(folder = "Review"), folder = "Review"))
        moved.delete()
        t.settle()
        assertTrue(moved.uiState.value.done)
        val left = t.commands.state.value.lists.getValue("storefront").project!!.commands
        assertFalse(left.any { it.name == "fix-ticket" })
    }

    @Test
    fun `outside a project a new command goes in the global list`() = runTest {
        val t = demoSession()
        t.commands.load("")
        t.settle()
        val vm = editor(t, CommandEditorKey("", body = "x"))
        assertEquals(CommandScope.Global, vm.uiState.value.draft.scope)
        assertEquals(listOf(CommandScope.Global), vm.uiState.value.places.map { it.scope })
    }

    @Test
    fun `a project's skill in a repo offers Keep out of Git and a global one doesn't`() = runTest {
        val t = demoSession()
        val vm = editor(t, CommandEditorKey("storefront", body = "Ship the release"))
        assertTrue(vm.uiState.value.canKeepOutOfGit)
        vm.place(CommandScope.Global, null)
        t.settle()
        assertFalse(vm.uiState.value.canKeepOutOfGit)
    }

    @Test
    fun `Save keeps a new skill out of Git and it reads back that way`() = runTest {
        val t = demoSession()
        val vm = editor(t, CommandEditorKey("storefront", body = "Ship the release"))
        vm.setName("mine")
        vm.setKeepOutOfGit(true)
        t.settle()
        assertFalse("a skill not committed needs no warning", vm.uiState.value.warnCommitted)
        vm.save()
        t.settle()
        val saved = t.commands.state.value.lists.getValue("storefront").project!!
            .commands.first { it.name == "mine" }
        assertTrue(saved.keptOutOfGit)
        assertFalse(saved.tracked)
    }

    @Test
    fun `turning it on for a committed skill warns first`() = runTest {
        val t = demoSession()
        editor(t, CommandEditorKey("storefront"))
        val committed = t.commands.state.value.lists.getValue("storefront").project!!
            .commands.first()
        assertTrue(committed.tracked)
        val vm = editor(t, committed.editorKey("storefront", SessionKey.Live))
        assertFalse(vm.uiState.value.warnCommitted)
        vm.setKeepOutOfGit(true)
        t.settle()
        assertTrue(vm.uiState.value.warnCommitted)
    }
}

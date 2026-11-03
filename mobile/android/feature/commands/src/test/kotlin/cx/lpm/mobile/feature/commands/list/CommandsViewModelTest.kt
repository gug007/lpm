package cx.lpm.mobile.feature.commands.list

import cx.lpm.mobile.core.model.CommandScope
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.testing.MainDispatcherRule
import cx.lpm.mobile.core.testing.TestSession
import cx.lpm.mobile.feature.commands.demoSession
import cx.lpm.mobile.feature.commands.folder.CommandFolderViewModel
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

class CommandsViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private fun TestScope.opened(
        t: TestSession,
        project: String = "storefront"
    ): CommandsViewModel {
        val vm = CommandsViewModel(project, SessionKey.Live, t.sessions)
        backgroundScope.launch { vm.uiState.collect {} }
        vm.watch.open()
        t.settle()
        return vm
    }

    @Test
    fun `a project shows its own folders first, then the global list`() = runTest {
        val vm = opened(demoSession())
        val state = vm.uiState.value
        assertEquals(listOf(CommandScope.Project, CommandScope.Global), state.scopes)
        assertEquals(CommandScope.Project, state.scope)
        assertEquals(
            listOf(FolderRowUi("Bugs", 1), FolderRowUi("Review", 1), FolderRowUi(null, 0)),
            state.folders
        )
        vm.pick(CommandScope.Global)
        assertEquals(
            listOf(FolderRowUi("Git", 1), FolderRowUi("Testing", 1), FolderRowUi(null, 1)),
            vm.uiState.value.folders
        )
    }

    @Test
    fun `no project shows only Global`() = runTest {
        val vm = opened(demoSession(), project = "")
        assertEquals(listOf(CommandScope.Global), vm.uiState.value.scopes)
        assertEquals(CommandScope.Global, vm.uiState.value.scope)
    }

    @Test
    fun `folders are created, renamed and deleted in the list showing`() = runTest {
        val t = demoSession()
        val vm = opened(t)
        vm.createFolder("Drafts")
        t.settle()
        assertTrue(FolderRowUi("Drafts", 0) in vm.uiState.value.folders)
        vm.renameFolder("Bugs", "Fixes")
        t.settle()
        assertTrue(FolderRowUi("Fixes", 1) in vm.uiState.value.folders)
        vm.deleteFolder("Fixes")
        t.settle()
        val folders = vm.uiState.value.folders
        assertFalse(folders.any { it.folder == "Fixes" })
        assertEquals(FolderRowUi(null, 1), folders.last())
    }

    @Test
    fun `a refused folder change is shown until dismissed`() = runTest {
        val t = demoSession()
        val vm = opened(t)
        vm.createFolder("review")
        t.settle()
        assertEquals("A folder named review already exists.", vm.uiState.value.changeError)
        vm.dismissError()
        assertNull(vm.uiState.value.changeError)
    }

    @Test
    fun `a folder lists its commands`() = runTest {
        val t = demoSession()
        val vm =
            CommandFolderViewModel(
                "storefront",
                CommandScope.Global,
                "Git",
                SessionKey.Live,
                t.sessions
            )
        backgroundScope.launch { vm.commands.collect {} }
        vm.watch.open()
        t.settle()
        assertEquals(listOf("commit-parts"), vm.commands.value.map { it.name })
    }
}

package cx.lpm.mobile.feature.files.preview

import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.git.GitExtrasStore
import cx.lpm.mobile.core.data.git.GitStore
import cx.lpm.mobile.core.data.mac.ThisDevice
import cx.lpm.mobile.core.data.prefs.PreferenceKeys
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.data.terminals.ComposerPrompts
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.navigation.FilePreviewKey
import cx.lpm.mobile.core.testing.MainDispatcherRule
import cx.lpm.mobile.core.testing.TestSession
import cx.lpm.mobile.core.testing.keepCollecting
import cx.lpm.mobile.feature.files.fetch.FileFetch
import cx.lpm.mobile.feature.files.fetch.FileFetches
import cx.lpm.mobile.feature.files.fetch.FilePreviewKind
import cx.lpm.mobile.feature.files.fetch.ScratchSpace
import cx.lpm.mobile.feature.files.fetch.TEST_MIME
import java.io.File
import java.nio.file.Files
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class FilePreviewViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private val root = Files.createTempDirectory("lpm-previews").toFile()

    /** What Mention put in which terminal's prompt. */
    private val prompts = mutableListOf<String>()

    private inner class FakePrompts : ComposerPrompts {
        override fun append(termId: String, text: String) {
            prompts += "$termId:$text"
        }

        override fun wire(client: LpmClient) = Unit

        override fun reset() = Unit
    }

    /** Demo Mode, whose Mac answers `fileChunk` with its sample files. */
    private fun TestScope.demo(): TestSession {
        val space = ScratchSpace(root, StandardTestDispatcher(testScheduler), backgroundScope)
        return TestSession(
            this,
            setOf(
                SessionStore.Factory { FileFetches(it, space, "phone", TEST_MIME::get) },
                SessionStore.Factory(::GitStore),
                SessionStore.Factory(::GitExtrasStore),
                SessionStore.Factory { FakePrompts() }
            )
        ).apply { enterDemo() }
    }

    // The screens' ViewModels, cleared as a closed sheet clears its own.
    private val screens = ViewModelStore()

    private fun TestScope.preview(t: TestSession, key: FilePreviewKey): FilePreviewViewModel {
        val factory = viewModelFactory {
            initializer {
                FilePreviewViewModel(
                    key,
                    t.sessions,
                    ThisDevice("Test Phone"),
                    t.prefs,
                    StandardTestDispatcher(testScheduler)
                )
            }
        }
        val vm = ViewModelProvider.create(
            screens,
            factory
        )[key.toString(), FilePreviewViewModel::class]
        keepCollecting(vm.uiState)
        testScheduler.advanceTimeBy(1_000)
        testScheduler.runCurrent()
        return vm
    }

    @Test
    fun `a Markdown file is copied over and read`() = runTest {
        val vm = preview(demo(), FilePreviewKey("storefront", listOf("README.md")))
        val state = vm.uiState.value
        assertEquals("README.md", state.filename)
        val ready = state.phase as FileFetch.Phase.Ready
        assertEquals(FilePreviewKind.Markdown, ready.kind)
        assertTrue(state.text!!.startsWith("# storefront\n\nA demo Next.js shop"))
        assertEquals("the whole file is here, so it can be shared", ready.file, state.shareable)
        assertFalse(state.markdownSource)
        assertNull("one range: a spinner, not a bar", state.progress)
    }

    @Test
    fun `the Preview or Source choice is remembered for every Markdown file`() = runTest {
        val t = demo()
        val vm = preview(t, FilePreviewKey("storefront", listOf("README.md")))
        vm.setMarkdownSource(true)
        testScheduler.runCurrent()
        assertTrue(vm.uiState.value.markdownSource)
        assertEquals(true, t.prefs.bool(PreferenceKeys.FILE_PREVIEW_MARKDOWN_SOURCE))
        val next = preview(t, FilePreviewKey("api-gateway", listOf("README.md")))
        assertTrue(next.uiState.value.markdownSource)
    }

    @Test
    fun `code opens as text, and closing the sheet deletes the copy`() = runTest {
        val vm = preview(demo(), FilePreviewKey("storefront", listOf("lib/payments.ts"), line = 12))
        val ready = vm.uiState.value.phase as FileFetch.Phase.Ready
        assertEquals(FilePreviewKind.Text, ready.kind)
        assertTrue(vm.uiState.value.text!!.startsWith("import { z } from \"zod\""))
        assertTrue(ready.file.exists())
        screens.clear()
        testScheduler.runCurrent()
        assertFalse(ready.file.exists())
    }

    @Test
    fun `a preview of a Mac visit that ended says so`() = runTest {
        val vm = preview(
            demo(),
            FilePreviewKey("storefront", listOf("README.md"), session = SessionKey.Visit("gone"))
        )
        assertEquals(
            FileFetch.Phase.Failed("Disconnected from the Mac this file is on."),
            vm.uiState.value.phase
        )
        assertEquals("README.md", vm.uiState.value.filename)
    }

    @Test
    fun `a Markdown file's images come from the same Mac`() = runTest {
        val vm = preview(demo(), FilePreviewKey("storefront", listOf("README.md")))
        var image: File? = null
        backgroundScope.launch { image = vm.imageReader.read("storefront", listOf("package.json")) }
        testScheduler.advanceTimeBy(1_000)
        testScheduler.runCurrent()
        assertTrue(image!!.readText().contains("\"name\": \"storefront\""))
    }

    @Test
    fun `a changed file offers Diff and goes by git's path`() = runTest {
        val vm = preview(
            demo(),
            FilePreviewKey("storefront", listOf("components/CheckoutForm.tsx"), line = 12)
        )
        val state = vm.uiState.value
        assertTrue(state.ready)
        assertEquals("components/CheckoutForm.tsx", state.changedPath)
        assertEquals("components/CheckoutForm.tsx", state.projectPath)
        assertEquals("components", state.folder)
        assertEquals(12, state.line)
        assertFalse("opened from no terminal's prompt", state.canMention)
        vm.mention()
        assertTrue(prompts.isEmpty())
    }

    @Test
    fun `Mention puts the file and its line in the prompt it was opened from`() = runTest {
        val vm = preview(
            demo(),
            FilePreviewKey(
                "storefront",
                listOf("lib/payments.ts"),
                line = 12,
                promptTerminal = "t1"
            )
        )
        val state = vm.uiState.value
        assertTrue(state.canMention)
        assertEquals("lib/payments.ts", state.projectPath)
        vm.mention()
        assertEquals(listOf("t1:@lib/payments.ts:12 "), prompts)
    }
}

package cx.lpm.mobile.feature.terminal.ui

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.terminal.R
import cx.lpm.mobile.feature.terminal.composer.ComposerNotices
import cx.lpm.mobile.feature.terminal.composer.ComposerPlusMenu
import cx.lpm.mobile.feature.terminal.composer.ComposerState
import cx.lpm.mobile.feature.terminal.composer.ComposerUiState
import cx.lpm.mobile.feature.terminal.composer.PlusMenuActions
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class ComposerTrayTest {
    @get:Rule
    val compose = createComposeRule()

    private val events = mutableListOf<String>()

    private fun tray(clipboardImage: Boolean = false, camera: Boolean = true) {
        compose.setContent {
            LpmTheme(darkTheme = true) {
                ComposerPlusMenu(
                    actions = PlusMenuActions(
                        onRewrite = { events += "rewrite" },
                        onPhotoLibrary = { events += "photos" },
                        onTakePhoto = if (camera) {
                            { events += "camera" }
                        } else {
                            null
                        },
                        onChooseFiles = { events += "files" },
                        onPasteImage = { events += "paste" },
                        onMemory = { events += "memory" },
                        onNewPrompt = { events += "new" },
                        onHistory = { events += "history" }
                    ),
                    canRewrite = true,
                    enabled = true,
                    hasText = true,
                    hasClipboardImage = { clipboardImage }
                )
            }
        }
        compose.onNodeWithContentDescription("Add", useUnmergedTree = true).performClick()
    }

    private fun notices(state: ComposerUiState) {
        compose.setContent {
            LpmTheme(darkTheme = true) {
                ComposerNotices(
                    state = state,
                    onDismissWarning = { events += "dismiss-warning" },
                    onDismissCommandNotice = { events += "dismiss-command" },
                    onDismissRewriteError = { events += "dismiss-rewrite" },
                    onDismissUploadError = { events += "dismiss-upload" },
                    onOpenDrafts = { events += "drafts" }
                )
            }
        }
    }

    @Test
    fun `attaching leads the tray as tiles, with the rest below`() {
        tray()
        listOf("Photos", "Camera", "Files", "Rewrite with AI", "Memory", "New prompt", "History")
            .forEach { compose.onNodeWithText(it).assertExists() }
        compose.onNodeWithText("Find in Terminal").assertDoesNotExist()
        compose.onNodeWithText("Paste Image").assertDoesNotExist()
        compose.onNodeWithText("Files").performClick()
        assertEquals(listOf("files"), events)
    }

    @Test
    fun `a phone without a camera loses that tile only`() {
        tray(camera = false)
        compose.onNodeWithText("Camera").assertDoesNotExist()
        compose.onNodeWithText("Photos").assertExists()
    }

    @Test
    fun `a copied image adds Paste Image`() {
        tray(clipboardImage = true)
        compose.onNodeWithText("Paste Image").performClick()
        assertEquals(listOf("paste"), events)
    }

    @Test
    fun `a saved draft offers Open Drafts`() {
        notices(ComposerUiState(sendWarning = R.string.composer_saved_to_drafts))
        compose.onNodeWithText("Saved to your drafts").assertExists()
        compose.onNodeWithText("Open Drafts").performClick()
        assertEquals(listOf("dismiss-warning", "drafts"), events)
    }

    @Test
    fun `a send problem says so with no button, and a tap clears it`() {
        notices(ComposerUiState(sendWarning = R.string.composer_still_uploading))
        compose.onNodeWithText("Open Drafts").assertDoesNotExist()
        compose.onNodeWithText("Still uploading", substring = true).performClick()
        assertEquals(listOf("dismiss-warning"), events)
    }

    @Test
    fun `a failed rewrite shows in the toast`() {
        val failed = ComposerState(transformError = "The rewrite timed out. Try again.")
        notices(ComposerUiState(composer = failed))
        compose.onNodeWithText("The rewrite timed out. Try again.").assertExists()
    }

    @Test
    fun `a toast leaves by itself`() {
        notices(ComposerUiState(sendWarning = R.string.composer_still_uploading))
        compose.mainClock.advanceTimeBy(5_000)
        assertEquals(emptyList<String>(), events)
        compose.mainClock.advanceTimeBy(1_100)
        assertEquals(listOf("dismiss-warning"), events)
    }
}

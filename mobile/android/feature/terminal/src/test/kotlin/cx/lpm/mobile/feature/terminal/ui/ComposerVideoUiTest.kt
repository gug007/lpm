package cx.lpm.mobile.feature.terminal.ui

import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.runtime.remember
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.terminal.R
import cx.lpm.mobile.feature.terminal.composer.ComposerCallbacks
import cx.lpm.mobile.feature.terminal.composer.ComposerLook
import cx.lpm.mobile.feature.terminal.composer.ComposerPlusMenu
import cx.lpm.mobile.feature.terminal.composer.ComposerSendButton
import cx.lpm.mobile.feature.terminal.composer.ComposerUiState
import cx.lpm.mobile.feature.terminal.composer.ComposerVideo
import cx.lpm.mobile.feature.terminal.composer.MentionActions
import cx.lpm.mobile.feature.terminal.composer.PlusMenuActions
import cx.lpm.mobile.feature.terminal.composer.TerminalComposer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
class ComposerVideoUiTest {
    @get:Rule
    val compose = createComposeRule()

    private val events = mutableListOf<String>()

    private fun video(on: Boolean = true, offReason: Int? = null) =
        ComposerVideo(on = on, offReason = offReason)

    private fun composer(video: ComposerVideo?) = compose.setContent {
        LpmTheme(darkTheme = true) {
            TerminalComposer(
                state = ComposerUiState(video = video),
                input = remember { TextFieldState() },
                look = ComposerLook(Color.Black, Color.White.copy(alpha = 0.08f), "Message"),
                focusRequester = remember { FocusRequester() },
                callbacks = ComposerCallbacks(
                    onFocusChanged = {},
                    onSend = {},
                    onHideKeyboard = {},
                    onKey = {},
                    onSwitchTab = {},
                    onCloseTab = {},
                    onRetryUpload = {},
                    onRemoveAttachment = {},
                    onCancelRewrite = {},
                    onPickSlash = {},
                    mentions = MentionActions({}, {}, {}, {}, {}, {})
                ),
                plusMenu = {},
                sendButton = {},
                dictationStrip = {}
            )
        }
    }

    private fun tray(video: ComposerVideo?) {
        compose.setContent {
            LpmTheme(darkTheme = true) {
                ComposerPlusMenu(
                    actions = PlusMenuActions(
                        onRewrite = {},
                        onPhotoLibrary = {},
                        onTakePhoto = null,
                        onChooseFiles = {},
                        onPasteImage = null,
                        onMemory = {},
                        onNewPrompt = {},
                        onHistory = {},
                        onToggleVideo = { events += "toggle" }
                    ),
                    canRewrite = true,
                    enabled = true,
                    hasText = true,
                    hasClipboardImage = { false },
                    video = video
                )
            }
        }
        compose.onNodeWithContentDescription("Add", useUnmergedTree = true).performClick()
    }

    private fun top(text: String) = compose.onNodeWithText(text).getUnclippedBoundsInRoot().top

    @Test
    fun `while a video is asked for the composer asks for one`() {
        composer(video())
        compose.onNodeWithText("Ask for a video…").assertExists()
        compose.onNodeWithText("Message").assertDoesNotExist()
    }

    @Test
    fun `a composer answering in text asks as usual`() {
        composer(video(on = false))
        compose.onNodeWithText("Ask for a video…").assertDoesNotExist()
        compose.onNodeWithText("Message").assertExists()
    }

    @Test
    fun `the tray offers a video answer right after the rewrite`() {
        tray(video(on = false))
        assertTrue(top("Rewrite with AI") < top("Answer as a video"))
        assertTrue(top("Answer as a video") < top("Memory"))
        compose.onNodeWithText("Answer as a video").performClick()
        assertEquals(listOf("toggle"), events)
    }

    @Test
    fun `while it is on the tray offers the way back to text`() {
        tray(video())
        compose.onNodeWithText("Answer as a video").assertDoesNotExist()
        compose.onNodeWithText("Back to a text answer").performClick()
        assertEquals(listOf("toggle"), events)
    }

    @Test
    fun `a computer that can't record says so on a row that's off`() {
        tray(video(on = false, offReason = R.string.video_needs_mac))
        compose.onNodeWithText("Videos record on a Mac").assertExists()
        compose.onNodeWithText("Answer as a video").assertIsNotEnabled().performClick()
        assertEquals(emptyList<String>(), events)
    }

    @Test
    fun `the tray says nothing of video where the agent can't make one`() {
        tray(null)
        compose.onNodeWithText("Rewrite with AI").assertExists()
        compose.onNodeWithText("Answer as a video").assertDoesNotExist()
    }

    @Test
    fun `send for a video is named for it and still saves a draft`() {
        compose.setContent {
            LpmTheme(darkTheme = true) {
                ComposerSendButton(
                    canSend = true,
                    menuUseful = true,
                    onSend = { events += "send" },
                    onSaveDraft = { events += "draft" },
                    onRunInDuplicates = null,
                    video = true
                )
            }
        }
        compose.onNodeWithContentDescription("Send", useUnmergedTree = true).assertDoesNotExist()
        val send = compose.onNodeWithContentDescription("Send for a video", useUnmergedTree = true)
        send.performClick()
        send.performTouchInput { longClick() }
        compose.onNodeWithText("Run in duplicates").assertDoesNotExist()
        compose.onNodeWithText("Save as draft").performClick()
        assertEquals(listOf("send", "draft"), events)
    }
}

package cx.lpm.mobile.feature.terminal.ui

import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.runtime.remember
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTouchInput
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.CommandScope
import cx.lpm.mobile.core.model.ServiceInfo
import cx.lpm.mobile.core.model.SlashCommand
import cx.lpm.mobile.feature.terminal.composer.ComposerCallbacks
import cx.lpm.mobile.feature.terminal.composer.ComposerLook
import cx.lpm.mobile.feature.terminal.composer.ComposerSendButton
import cx.lpm.mobile.feature.terminal.composer.ComposerState
import cx.lpm.mobile.feature.terminal.composer.ComposerTab
import cx.lpm.mobile.feature.terminal.composer.ComposerUiState
import cx.lpm.mobile.feature.terminal.composer.MentionActions
import cx.lpm.mobile.feature.terminal.composer.MentionResults
import cx.lpm.mobile.feature.terminal.composer.TerminalComposer
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
class ComposerUiTest {
    @get:Rule
    val compose = createComposeRule()

    private val events = mutableListOf<String>()

    private val callbacks = ComposerCallbacks(
        onFocusChanged = {},
        onSend = { events += "send" },
        onHideKeyboard = { events += "hide" },
        onKey = { events += "key:" + it.map { c -> c.code }.joinToString(",") },
        onSwitchTab = { events += "switch:$it" },
        onCloseTab = { events += "close:$it" },
        onRetryUpload = {},
        onRemoveAttachment = {},
        onCancelRewrite = { events += "cancel" },
        onPickSlash = { events += "slash:${it.name}" },
        mentions = MentionActions({}, {}, {}, {}, {})
    )

    private fun show(
        state: ComposerUiState,
        look: ComposerLook = terminalLook,
        callbacks: ComposerCallbacks = this.callbacks
    ) = compose.setContent {
        LpmTheme(darkTheme = true) {
            TerminalComposer(
                state = state,
                input = remember { TextFieldState(state.composer.text) },
                look = look,
                focusRequester = remember { FocusRequester() },
                callbacks = callbacks,
                plusMenu = {},
                sendButton = {}
            )
        }
    }

    private val terminalLook = ComposerLook(Color.Black, Color.White.copy(alpha = 0.08f), "Message")

    @Test
    fun `a reply box has no terminal keys, slash commands or terminal output`() {
        show(
            ComposerUiState(
                composer = ComposerState(tabs = listOf(ComposerTab(text = "see @"))),
                terminalTools = false,
                mentionActive = true,
                mentions = MentionResults(
                    services = listOf(
                        ServiceInfo("web", paneIndex = 0, running = true, cmd = "", port = 3000)
                    )
                )
            ),
            look = ComposerLook(Color.White, Color.LightGray, "Reply to this run")
        )
        compose.onNodeWithText("esc").assertDoesNotExist()
        compose.onNodeWithContentDescription("Up").assertDoesNotExist()
        compose.onNodeWithText("This terminal's output").assertDoesNotExist()
        compose.onNodeWithText("web logs").assertExists()
    }

    @Test
    fun `a reply box with nothing to mention shows no menu and its own placeholder`() {
        show(
            ComposerUiState(terminalTools = false, mentionActive = true),
            look = ComposerLook(Color.White, Color.LightGray, "Reply to this run")
        )
        compose.onNodeWithText("Reply to this run").assertExists()
        compose.onNodeWithText("CONTEXT").assertDoesNotExist()
    }

    @Test
    fun `a disabled reply box takes no input`() {
        show(
            ComposerUiState(
                composer = ComposerState(tabs = listOf(ComposerTab(text = ""))),
                terminalTools = false
            ),
            look = ComposerLook(
                Color.White,
                Color.LightGray,
                "Automation is running…",
                enabled = false
            )
        )
        compose.onNodeWithText("Automation is running…").assertExists()
        compose.onAllNodes(hasSetTextAction()).assertCountEquals(0)
    }

    @Test
    fun `special keys send their raw sequences`() {
        show(ComposerUiState())
        compose.onNodeWithText("esc").performClick()
        compose.onNodeWithText("⌃C").performClick()
        compose.onNodeWithContentDescription("⏎").performClick()
        compose.onNodeWithContentDescription("Up").performClick()
        compose.onNodeWithContentDescription("Right").performScrollTo().performClick()
        assertEquals(listOf("key:27", "key:3", "key:13", "key:27,91,65", "key:27,91,67"), events)
    }

    @Test
    fun `a typed slash command offers its completions`() {
        show(
            ComposerUiState(
                composer = ComposerState(tabs = listOf(ComposerTab(text = "/re"))),
                slashMatches = listOf(
                    SlashCommand("review", "Review a pull request", "", "builtin")
                )
            )
        )
        compose.onNodeWithText("Review a pull request").assertExists()
        compose.onNodeWithText("/review").performClick()
        assertEquals(listOf("slash:review"), events)
    }

    @Test
    fun `lpm commands lead the slash menu under their folder and list`() {
        val withManage = callbacks.run {
            ComposerCallbacks(
                onFocusChanged, onSend, onHideKeyboard, onKey, onSwitchTab, onCloseTab,
                onRetryUpload, onRemoveAttachment, onCancelRewrite, onPickSlash, mentions,
                onManageCommands = { events += "manage" }
            )
        }
        show(
            ComposerUiState(
                composer = ComposerState(tabs = listOf(ComposerTab(text = "/"))),
                slashMatches = listOf(
                    SlashCommand(
                        "fix-ticket",
                        "Fix",
                        "<ticket>",
                        "lpm",
                        "Bugs",
                        CommandScope.Project
                    ),
                    SlashCommand("explain", "", "", "lpm", null, CommandScope.Global),
                    SlashCommand("review", "", "", "builtin")
                ),
                agentLabel = "Claude Code",
                lpmCommands = true
            ),
            callbacks = withManage
        )
        compose.onNodeWithText("BUGS · THIS PROJECT").assertExists()
        compose.onNodeWithText("NO FOLDER · GLOBAL").assertExists()
        compose.onNodeWithText("CLAUDE CODE").assertExists()
        compose.onNodeWithText("/explain").performClick()
        compose.onNodeWithText("Manage commands").performClick()
        assertEquals(listOf("slash:explain", "manage"), events)
    }

    @Test
    fun `prompt tabs switch and close`() {
        show(
            ComposerUiState(
                composer = ComposerState(
                    tabs = listOf(ComposerTab(text = "first prompt"), ComposerTab(text = "second")),
                    activeIndex = 1
                )
            )
        )
        compose.onNodeWithText("first prompt").performClick()
        compose.onAllNodesWithContentDescription("Close")[0].performClick()
        assertEquals(listOf("switch:0", "close:0"), events)
    }

    @Test
    fun `a rewrite in flight locks the composer with a way out`() {
        show(ComposerUiState(composer = ComposerState(transforming = true)))
        compose.onNodeWithText("Rewriting your prompt…").assertExists()
        compose.onNodeWithText("Cancel").performClick()
        assertEquals(listOf("cancel"), events)
    }

    @Test
    fun `send taps send and a long press offers the draft and duplicates`() {
        compose.setContent {
            LpmTheme(darkTheme = true) {
                ComposerSendButton(
                    canSend = true,
                    menuUseful = true,
                    onSend = { events += "send" },
                    onSaveDraft = { events += "draft" },
                    onRunInDuplicates = { events += "dup:$it" }
                )
            }
        }
        compose.onNodeWithContentDescription("Send", useUnmergedTree = true).performClick()
        compose.onNodeWithContentDescription("Send", useUnmergedTree = true).performTouchInput {
            longClick()
        }
        compose.onNodeWithText("Save as draft").performClick()
        assertEquals(listOf("send", "draft"), events)
    }

    @Test
    fun `send is off with nothing to send or save`() {
        compose.setContent {
            LpmTheme(darkTheme = true) {
                ComposerSendButton(
                    canSend = false,
                    menuUseful = false,
                    onSend = { events += "send" },
                    onSaveDraft = {},
                    onRunInDuplicates = null
                )
            }
        }
        compose.onNodeWithContentDescription("Send", useUnmergedTree = true).performClick()
        assertEquals(emptyList<String>(), events)
    }
}

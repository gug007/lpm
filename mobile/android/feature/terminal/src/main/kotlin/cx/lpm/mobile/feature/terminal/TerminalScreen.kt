package cx.lpm.mobile.feature.terminal

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.GlassIconButton
import cx.lpm.mobile.core.designsystem.component.LpmTopBar
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.core.web.TerminalWebController
import cx.lpm.mobile.core.web.TerminalWebView
import cx.lpm.mobile.core.web.TextExtent
import kotlinx.coroutines.delay

private const val FIRST_CONTENT_FALLBACK_MS = 5_000L
private const val BANNER_ANIMATION_MS = 200

/** What the terminal's web view reports, routed to the view model. */
internal class TerminalStreamCallbacks(
    val onInput: (String) -> Unit,
    val onResize: (cols: Int, rows: Int) -> Unit,
    val onRevive: () -> Unit,
    val onPageRestart: () -> Unit,
    val onOpenPath: (paths: List<String>, line: Int) -> Unit,
    val onFirstContent: () -> Unit = {}
)

/**
 * A single terminal: xterm.js renders the output streamed in and posts keystrokes
 * back — the emulator the desktop uses, so rendering matches and scrollback
 * works. The terminal sits below a bar in its own ground color; the composer sits
 * below it and rides above the keyboard.
 *
 * A terminal is live in exactly one place at a time: while the desktop (or another
 * phone) owns it, "take control" shows instead — over a web view kept mounted, so
 * this phone stays subscribed and takes over at once on a claim.
 */
@Composable
internal fun TerminalScreen(
    state: TerminalUiState,
    terminal: TerminalInfo,
    controller: TerminalWebController,
    stream: TerminalStreamCallbacks,
    onBack: () -> Unit,
    onTakeControl: () -> Unit,
    onRestart: () -> Unit,
    onCloseTab: () -> Unit,
    modifier: Modifier = Modifier,
    trailing: @Composable RowScope.() -> Unit = {},
    connectionBanner: @Composable () -> Unit = {},
    findBar: @Composable () -> Unit = {},
    composer: @Composable () -> Unit = {}
) {
    val ground = state.look.theme.backgroundColor
    val textExtent = remember { TextExtent() }
    var hasContent by remember { mutableStateOf(false) }
    // Never leave the spinner up if no screen ever arrives (the link drops mid-open).
    LaunchedEffect(Unit) {
        delay(FIRST_CONTENT_FALLBACK_MS)
        hasContent = true
    }
    Column(modifier.fillMaxSize().background(ground)) {
        LpmTopBar(
            containerColor = ground,
            leading = {
                GlassIconButton(
                    icon = painterResource(DesignR.drawable.ic_arrow_back_ios_new),
                    contentDescription = stringResource(R.string.terminal_back),
                    onClick = onBack
                )
            },
            trailing = trailing,
            keepTitleCentered = true
        ) {
            TerminalTitle(
                label = terminal.label,
                statusLine = state.statusLine,
                agent = state.agent,
                git = state.git,
                gitLoading = state.gitLoading
            )
        }
        Column(
            Modifier.weight(
                1f
            ).windowInsetsPadding(WindowInsets.navigationBars.union(WindowInsets.ime))
        ) {
            Box(Modifier.weight(1f).fillMaxWidth()) {
                KeyboardSteadyFrame(
                    extent = textExtent,
                    modifier = Modifier.fillMaxSize()
                ) { hidden ->
                    TerminalWebView(
                        controller = controller,
                        onInput = stream.onInput,
                        onResize = stream.onResize,
                        modifier = Modifier.fillMaxSize(),
                        controlled = state.controlled,
                        hiddenInsets = hidden,
                        textExtent = textExtent,
                        fontSize = state.look.fontSize,
                        theme = state.look.theme,
                        onFirstContent = {
                            hasContent = true
                            stream.onFirstContent()
                        },
                        onOpenPath = stream.onOpenPath,
                        onRevive = stream.onRevive,
                        onPageRestart = stream.onPageRestart
                    )
                }
                LoadingOverlay(
                    visible = state.controlled && !hasContent && state.ended == null,
                    background = ground
                )
                if (!state.controlled && state.ended == null) {
                    ControlHandoffView(
                        ownerLabel = state.ownerLabel,
                        background = ground,
                        onTakeControl = onTakeControl
                    )
                }
                TerminalBanners(
                    state = state,
                    connectionBanner = connectionBanner,
                    modifier = Modifier.align(Alignment.TopCenter).padding(top = 8.dp)
                )
                AccountMoveOverlay(move = state.accountMove, background = ground)
                Box(Modifier.align(Alignment.TopCenter)) { findBar() }
            }
            val endedHere = state.endedHere
            if (state.showsComposer) {
                composer()
            } else if (endedHere != null) {
                TerminalEndedBar(
                    label = terminal.label,
                    ending = endedHere,
                    background = ground,
                    onRestart = onRestart.takeIf { state.canRestart },
                    onClose = onCloseTab
                )
            }
        }
    }
}

@Composable
private fun AccountMoveOverlay(move: String?, background: Color) {
    AnimatedVisibility(
        visible = move != null,
        enter = fadeIn(tween(BANNER_ANIMATION_MS)),
        exit = fadeOut(tween(BANNER_ANIMATION_MS))
    ) {
        // Keeps the account's name while the cover fades out.
        val shown = remember { move.orEmpty() }
        TerminalAccountMoveView(account = shown, background = background)
    }
}

@Composable
private fun LoadingOverlay(visible: Boolean, background: Color) {
    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(tween(BANNER_ANIMATION_MS)),
        exit = fadeOut(tween(BANNER_ANIMATION_MS))
    ) {
        TerminalLoadingView(background = background)
    }
}

/**
 * While the link is down the connection banner says why nothing responds
 * (keystrokes and scrolling are dropped meanwhile); otherwise how the terminal ended,
 * or for a moment that it's the tab lpm reopened after restarting.
 */
@Composable
private fun TerminalBanners(
    state: TerminalUiState,
    connectionBanner: @Composable () -> Unit,
    modifier: Modifier = Modifier
) {
    val ended = state.ended
    val enter =
        slideInVertically(tween(BANNER_ANIMATION_MS)) { -it } + fadeIn(tween(BANNER_ANIMATION_MS))
    val exit =
        slideOutVertically(tween(BANNER_ANIMATION_MS)) { -it } + fadeOut(tween(BANNER_ANIMATION_MS))
    Box(modifier) {
        AnimatedVisibility(visible = !state.connectionReady, enter = enter, exit = exit) {
            connectionBanner()
        }
        AnimatedVisibility(
            visible = state.connectionReady && ended != null && state.endedHere == null,
            enter = enter,
            exit = exit
        ) {
            if (ended != null) TerminalEndedBanner(ended.message)
        }
        AnimatedVisibility(
            visible = state.connectionReady && ended == null && state.reopened,
            enter = enter,
            exit = exit
        ) {
            TerminalEndedBanner(
                text = stringResource(R.string.terminal_reopened),
                icon = DesignR.drawable.ic_refresh
            )
        }
    }
}

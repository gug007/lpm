package cx.lpm.mobile.core.web

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.sample
import kotlinx.coroutines.flow.take

/** A controller that lives as long as the screen showing the terminal. */
@Composable
fun rememberTerminalWebController(): TerminalWebController = remember { TerminalWebController() }

/**
 * The terminal, rendered by xterm.js (web/terminal.html) in a WebView — the same
 * emulator the desktop uses, so rendering matches and scrollback works. Server
 * output goes in through [controller]; the page posts keystrokes ([onInput]) and
 * its fitted geometry ([onResize]) back out.
 *
 * @param controlled whether this phone owns the terminal; gaining ownership
 *   re-sends the fitted size so the PTY follows the phone.
 * @param hiddenInsets heights at the top and bottom of the view that sit out of
 *   sight, so xterm fits its rows to the part between them (only top and bottom
 *   are read).
 * @param textExtent kept current with where the text ends, for the keyboard slide.
 * @param onFirstContent fired once, when the first screen content renders.
 * @param onOpenPath a file path was tapped: its readings (most likely first) and `:line`.
 * @param onOpenUrl an http(s) link was tapped; opens in the browser by default.
 * @param onRevive the app came back from the background: ask the Mac for the
 *   output missed meanwhile (`resync`).
 * @param onPageRestart the page starts over after its renderer died: ask the Mac
 *   for a full snapshot (`reseed`).
 * @param onAddToPrompt text a hold selected, for the composer; null where there's no
 *   composer to add it to. Copy is handled here.
 * @param onFind text a hold selected, to find in the terminal.
 * @param savedScreen the screen kept from before, while the Mac is away: shown until a
 *   live one is, and [onSavedScreenShow] fired once it's up.
 * @param onScreen the live screen to keep, once its output goes quiet, and when it was
 *   live in millis; null for a terminal whose screen isn't kept.
 */
@Composable
fun TerminalWebView(
    controller: TerminalWebController,
    onInput: (String) -> Unit,
    onResize: (cols: Int, rows: Int) -> Unit,
    modifier: Modifier = Modifier,
    controlled: Boolean = true,
    hiddenInsets: PaddingValues = PaddingValues(),
    textExtent: TextExtent? = null,
    fontSize: Int = TerminalPrefs.DEFAULT_FONT_SIZE,
    theme: TerminalTheme = TerminalPrefs.DefaultTheme,
    onFirstContent: () -> Unit = {},
    onOpenPath: (paths: List<String>, line: Int) -> Unit = { _, _ -> },
    onOpenUrl: ((String) -> Unit)? = null,
    onRevive: () -> Unit = {},
    onPageRestart: () -> Unit = {},
    onAddToPrompt: ((String) -> Unit)? = null,
    onFind: (String) -> Unit = {},
    savedScreen: String? = null,
    onSavedScreenShow: () -> Unit = {},
    onScreen: ((text: String, at: Long) -> Unit)? = null
) {
    val uriHandler = LocalUriHandler.current
    val haptics = LocalHapticFeedback.current
    val clipboard = LocalClipboard.current
    val scope = rememberCoroutineScope()
    SideEffect {
        val selection = SelectionHandler(haptics, clipboard, scope, onAddToPrompt, onFind)
        controller.textExtent = textExtent
        controller.callbacks = TerminalCallbacks(
            onInput = onInput,
            onResize = onResize,
            onFirstContent = onFirstContent,
            onSavedScreenShow = onSavedScreenShow,
            onScreen = onScreen,
            onOpenPath = onOpenPath,
            onOpenUrl = onOpenUrl ?: uriHandler::openInBrowser,
            onRevive = onRevive,
            onPageRestart = onPageRestart,
            onSelection = selection::handle
        )
    }
    val top = hiddenInsets.calculateTopPadding().value.toInt()
    val bottom = hiddenInsets.calculateBottomPadding().value.toInt()
    key(controller.generation) {
        AndroidView(
            factory = { context ->
                val page = TerminalWebPool.take(context)
                controller.attach(page)
                page.listener = controller::onMessage
                page.onGone = controller::pageLost
                page.view
            },
            modifier = modifier,
            onRelease = { view ->
                view.page?.let { page ->
                    controller.detach(page)
                    page.destroy()
                }
            },
            update = {
                controller.applyFontSize(fontSize)
                controller.applyTheme(theme)
                controller.applyHiddenInsets(top, bottom)
                controller.controlChanged(controlled)
                controller.showSaved(savedScreen)
            }
        )
    }
    if (onScreen != null) KeepScreen(controller)
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, controller) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> controller.foreground()

                Lifecycle.Event.ON_STOP -> {
                    controller.keepScreen()
                    controller.background()
                }

                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
}

/** Hands over the live screen once its output goes quiet, or now and then while it doesn't. */
@OptIn(FlowPreview::class)
@Composable
private fun KeepScreen(controller: TerminalWebController) {
    LaunchedEffect(controller) {
        val ticks = snapshotFlow { controller.liveTick }.filter { it > 0 }
        merge(
            // The first one soon, however busy it is, for a tab that's only glanced at.
            ticks.take(1).onEach { delay(FIRST_MS) },
            ticks.debounce(QUIET_MS),
            ticks.sample(CEILING_MS)
        )
            .collect { controller.keepScreen() }
    }
}

private const val FIRST_MS = 500L
private const val QUIET_MS = 2_000L
private const val CEILING_MS = 15_000L

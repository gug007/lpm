package cx.lpm.mobile.core.web

import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.unit.dp
import java.io.ByteArrayOutputStream
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

/**
 * Drives one [TerminalWebView]: the screen streams the terminal in through
 * [seed] and [feed], and sends composed messages with [submit] — the hooks the
 * iOS view hands the model. Everything runs on the main thread.
 *
 * Live output is coalesced: bytes accumulate and go to the page as one write
 * per main-loop turn instead of one cross-process `evaluateJavascript` per
 * server message.
 */
class TerminalWebController internal constructor(private val post: (() -> Unit) -> Unit) {
    constructor() : this(mainPost)

    internal var callbacks = TerminalCallbacks()
    internal var textExtent: TextExtent? = null

    /** Bumped when the page is lost, so the view builds a fresh WebView. */
    internal var generation by mutableIntStateOf(0)
        private set

    private var surface: TerminalSurface? = null
    private var hiddenInsets = Insets(0, 0)
    private var fontSize = TerminalPrefs.DEFAULT_FONT_SIZE
    private var theme = TerminalPrefs.DefaultTheme
    private var ready = false
    private var announcedContent = false
    private val feedBuffer = ByteArrayOutputStream()
    private var flushScheduled = false

    // A seed that arrives before the page is ready; only the latest matters since
    // it's a full snapshot of the screen.
    private var pendingSeed: Pair<String, Int>? = null

    // Last size xterm fitted to, and whether this phone owns the terminal, so an
    // ownership handoff can re-drive the PTY to the phone's size.
    private var lastCols = 0
    private var lastRows = 0
    private var wasControlled = false

    // What the page last got, so unchanged values skip a cross-process call.
    private var lastAppliedInsets: Insets? = null
    private var lastAppliedFontSize = Int.MIN_VALUE
    private var lastAppliedTheme: TerminalTheme? = null
    private var backgrounded = false

    /** Whether terminal.html has loaded and announced itself. */
    val isReady: Boolean get() = ready

    /** The current match of the last find (-1 for none) and how many there are. */
    var findIndex by mutableIntStateOf(-1)
        private set
    var findCount by mutableIntStateOf(0)
        private set

    /**
     * Find in the scrollback, as the desktop's search bar does: the page marks every
     * match and reports the current one out of how many. [step] is
     * [FindStep.Type] while the query is being typed (stay on a match that still fits).
     */
    fun find(query: String, step: FindStep) {
        surface?.evaluate(TerminalScripts.find(query, step.script))
    }

    fun clearFind() {
        findIndex = -1
        findCount = 0
        surface?.evaluate(TerminalScripts.FIND_CLEAR)
    }

    /**
     * Apply a seed. A resetting seed replays the whole screen, so any output
     * buffered before it is stale — drop it. A non-resetting one is the slice
     * this phone missed while it was away: it belongs after whatever is already
     * buffered, so it goes through the normal feed path.
     */
    fun seed(data: String, reset: Boolean, ptyCols: Int, ptyRows: Int) {
        matchPtySize(ptyCols, ptyRows)
        if (!reset) {
            feed(data)
            return
        }
        feedBuffer.reset()
        if (!ready) {
            pendingSeed = data to ptyCols
            return
        }
        evalSeed(data, ptyCols)
    }

    fun feed(data: String) {
        feedBuffer.write(data.toByteArray(Charsets.UTF_8))
        if (!ready || flushScheduled) return
        flushScheduled = true
        post(::flush)
    }

    /** Submit a composed message via the page's bracketed-paste-aware helper. */
    fun submit(text: String) {
        surface?.evaluate(TerminalScripts.submit(text))
    }

    /**
     * The last [lines] of the terminal buffer as text, for the composer's
     * "@ terminal output" mention; "" if the page isn't up.
     */
    suspend fun capture(lines: Int): String = suspendCancellableCoroutine { continuation ->
        val surface = surface
        if (surface == null) {
            continuation.resume("")
        } else {
            surface.evaluate(TerminalScripts.capture(lines)) {
                continuation.resume(TerminalScripts.captured(it))
            }
        }
    }

    /** Focus the terminal's input and raise the keyboard, as a tap on the terminal does. */
    fun focus() {
        surface?.focusInput()
    }

    /** Take focus off the terminal's input, closing the keyboard; a tap brings it back. */
    fun hideKeyboard() {
        surface?.blurInput()
    }

    internal fun attach(surface: TerminalSurface) {
        this.surface = surface
        surface.setBackground(theme)
    }

    internal fun detach(surface: TerminalSurface) {
        if (this.surface !== surface) return
        this.surface = null
        ready = false
    }

    /**
     * The renderer is gone and the WebView with it. Forget what the page had,
     * build a new one and ask for a fresh seed, which lands once it is ready.
     */
    internal fun pageLost() {
        ready = false
        feedBuffer.reset()
        pendingSeed = null
        lastAppliedInsets = null
        lastAppliedFontSize = Int.MIN_VALUE
        lastAppliedTheme = null
        generation++
        callbacks.onPageRestart()
    }

    internal fun background() {
        backgrounded = true
        surface?.pause()
    }

    /**
     * Back on screen after the app was in the background: the WebGL glyph atlas
     * may have been reclaimed (glyphs come out blank) and output may have been
     * missed while the link was down. Rebuild the renderer and ask for the slice.
     */
    internal fun foreground() {
        surface?.resume()
        if (!backgrounded) return
        backgrounded = false
        callbacks.onRevive()
        if (ready) surface?.evaluate(TerminalScripts.REVIVE)
    }

    /**
     * On gaining ownership, resend the last fitted size so the PTY resizes to
     * this phone (resizes are dropped while not the owner, and a claim fires no
     * fresh size from the page).
     */
    internal fun controlChanged(controlled: Boolean) {
        val gained = controlled && !wasControlled
        wasControlled = controlled
        if (gained && lastCols > 0 && lastRows > 0) callbacks.onResize(lastCols, lastRows)
    }

    internal fun applyHiddenInsets(top: Int, bottom: Int) {
        hiddenInsets = Insets(top, bottom)
        if (!ready || hiddenInsets == lastAppliedInsets) return
        lastAppliedInsets = hiddenInsets
        surface?.evaluate(TerminalScripts.setInsets(top, bottom))
    }

    internal fun applyFontSize(px: Int) {
        fontSize = px
        if (!ready || px == lastAppliedFontSize) return
        lastAppliedFontSize = px
        surface?.evaluate(TerminalScripts.setFontSize(px))
    }

    /** The page's colors and the WebView's own ground, so the surface behind it matches too. */
    internal fun applyTheme(theme: TerminalTheme) {
        this.theme = theme
        surface?.setBackground(theme)
        if (!ready || theme == lastAppliedTheme) return
        lastAppliedTheme = theme
        surface?.evaluate(TerminalScripts.setTheme(theme))
    }

    internal fun onMessage(message: PageMessage) {
        when (message.name) {
            "input" -> message.string?.let(callbacks.onInput)

            "resize" -> {
                val cols = message.int("cols") ?: return
                val rows = message.int("rows") ?: return
                lastCols = cols
                lastRows = rows
                callbacks.onResize(cols, rows)
            }

            "openPath" -> {
                val paths = message.strings("paths")?.takeIf { it.isNotEmpty() } ?: return
                callbacks.onOpenPath(paths, message.int("line") ?: 0)
            }

            "extent" -> {
                val bottom = message.double("bottom") ?: return
                textExtent?.bottom = bottom.dp
                textExtent?.fillsOnGrow = message.boolean("fills") ?: true
            }

            // The text comes from whatever the terminal printed: open web links only.
            "openURL" -> message.string?.takeIf(::isWebLink)?.let(callbacks.onOpenUrl)

            "ready" -> onReady()

            "find" -> {
                findIndex = message.int("index") ?: -1
                findCount = message.int("count") ?: 0
            }

            "selection" -> TerminalSelection.from(message)?.let(callbacks.onSelection)
        }
    }

    private fun onReady() {
        ready = true
        applyHiddenInsets(hiddenInsets.top, hiddenInsets.bottom)
        // Font and theme before the seed, so the first paint uses them.
        applyFontSize(fontSize)
        applyTheme(theme)
        // Seed first (full snapshot), then any output that arrived after it. No
        // auto-focus: opening a terminal shouldn't raise the keyboard.
        pendingSeed?.let { (data, cols) ->
            pendingSeed = null
            evalSeed(data, cols)
        }
        flush()
    }

    /**
     * A seed carries the PTY's size, which can still be another surface's: a
     * resize sent while the link was down is dropped, and the desktop resizes the
     * PTY while the phone is away. xterm only reports a size when its own fit
     * changes, so re-send ours.
     */
    private fun matchPtySize(cols: Int, rows: Int) {
        if (lastCols <= 0 || lastRows <= 0 || (cols == lastCols && rows == lastRows)) return
        callbacks.onResize(lastCols, lastRows)
    }

    private fun flush() {
        flushScheduled = false
        if (!ready || feedBuffer.size() == 0) return
        val bytes = feedBuffer.toByteArray()
        feedBuffer.reset()
        surface?.evaluate(TerminalScripts.feed(bytes))
        announceContent()
    }

    private fun evalSeed(data: String, cols: Int) {
        surface?.evaluate(TerminalScripts.seed(data, cols))
        announceContent()
    }

    private fun announceContent() {
        if (announcedContent) return
        announcedContent = true
        callbacks.onFirstContent()
    }

    private data class Insets(val top: Int, val bottom: Int)

    private companion object {
        val mainHandler by lazy { Handler(Looper.getMainLooper()) }
        val mainPost: (() -> Unit) -> Unit = { mainHandler.post(it) }

        val webSchemes = setOf("http", "https")

        fun isWebLink(url: String): Boolean = url.substringBefore(':', "").lowercase() in webSchemes
    }
}

/** How a find moves: while typing, or to the next or previous match. */
enum class FindStep(internal val script: String) { Type("type"), Next("next"), Prev("prev") }

/** What the page reports, routed to the screen. */
internal class TerminalCallbacks(
    val onInput: (String) -> Unit = {},
    val onResize: (cols: Int, rows: Int) -> Unit = { _, _ -> },
    val onFirstContent: () -> Unit = {},
    val onOpenPath: (paths: List<String>, line: Int) -> Unit = { _, _ -> },
    val onOpenUrl: (String) -> Unit = {},
    val onRevive: () -> Unit = {},
    val onPageRestart: () -> Unit = {},
    val onSelection: (TerminalSelection) -> Unit = {}
)

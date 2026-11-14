package cx.lpm.mobile.core.web

import android.content.Context
import android.content.MutableContextWrapper
import android.view.inputmethod.InputMethodManager
import androidx.compose.ui.graphics.toArgb

/** What the controller drives: terminal.html in a WebView. */
internal interface TerminalSurface {
    fun evaluate(script: String, result: ((String?) -> Unit)? = null)

    fun setBackground(theme: TerminalTheme)

    fun focusInput()

    fun blurInput()

    fun pause()

    fun resume()
}

/**
 * One WebView running terminal.html, created ahead of its screen when pooled.
 * Messages the page posts before a controller listens are held back: the page's
 * `ready`, replayed when one attaches, and its last fitted size, replayed only if
 * the page doesn't report a fresh one once laid out on screen (xterm reports a
 * size only when its fit changes, and the screen still needs the first one).
 */
internal class TerminalPage private constructor(val view: TerminalInputWebView) : TerminalSurface {
    var onGone: () -> Unit = {}
    var listener: ((PageMessage) -> Unit)? = null
        set(value) {
            field = value
            if (value != null && readyEarly) replayEarly(value)
        }
    private var readyEarly = false
    private var sizeEarly: PageMessage? = null
    private var sizedSinceAttach = false

    init {
        view.page = this
    }

    /** Hands a pooled page to the screen's context (it was created on the application's). */
    fun adopt(context: Context) {
        (view.context as MutableContextWrapper).baseContext = context
    }

    private fun dispatch(message: PageMessage) {
        if (message.name == SELECTION) {
            view.selecting = TerminalSelection.from(message) == TerminalSelection.Began
        }
        val listener = listener
        if (listener == null) {
            when (message.name) {
                READY -> readyEarly = true
                RESIZE -> sizeEarly = message
            }
            return
        }
        if (message.name == RESIZE) sizedSinceAttach = true
        listener(message)
    }

    private fun replayEarly(listener: (PageMessage) -> Unit) {
        readyEarly = false
        view.post { if (this.listener === listener) listener(PageMessage(READY)) }
        val size = sizeEarly ?: return
        sizeEarly = null
        view.postDelayed({
            if (this.listener === listener && !sizedSinceAttach) listener(size)
        }, EARLY_SIZE_DELAY_MS)
    }

    override fun evaluate(script: String, result: ((String?) -> Unit)?) {
        view.evaluateJavascript(script, result)
    }

    override fun setBackground(theme: TerminalTheme) {
        view.setBackgroundColor(theme.backgroundColor.toArgb())
    }

    override fun focusInput() {
        view.requestFocus()
        view.evaluateJavascript(TerminalScripts.FOCUS) {
            view.context.getSystemService(InputMethodManager::class.java)?.showSoftInput(view, 0)
        }
    }

    override fun blurInput() {
        view.evaluateJavascript(TerminalScripts.BLUR, null)
        view.context.getSystemService(
            InputMethodManager::class.java
        )?.hideSoftInputFromWindow(view.windowToken, 0)
    }

    override fun pause() = view.onPause()

    override fun resume() = view.onResume()

    fun destroy() {
        listener = null
        view.page = null
        view.destroy()
    }

    companion object {
        private const val READY = "ready"
        private const val RESIZE = "resize"
        private const val SELECTION = "selection"
        private const val EARLY_SIZE_DELAY_MS = 300L

        fun create(context: Context): TerminalPage {
            val view = TerminalInputWebView(MutableContextWrapper(context))
            val page = TerminalPage(view)
            view.applyLpmSettings()
            // xterm sizes its own text (Settings → Terminal); the system font scale must not.
            view.settings.textZoom = 100
            view.setBackgroundColor(TerminalPrefs.DefaultTheme.backgroundColor.toArgb())
            val fallback = view.installBridge(TerminalScripts.handlers, page::dispatch)
            view.webViewClient = LpmWebClient(
                assets = WebPages.assetLoader(context),
                documentStartFallback = fallback,
                onGone = { page.onGone() }
            )
            view.loadUrl(WebPages.TERMINAL_URL)
            return page
        }
    }
}

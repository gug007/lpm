package cx.lpm.mobile.core.web

import android.content.Context
import android.text.InputType
import android.view.MotionEvent
import android.view.ViewConfiguration
import android.view.WindowInsets
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.webkit.WebView
import kotlin.math.hypot

/**
 * The terminal's WebView. Keystrokes come from xterm's hidden textarea; see
 * [TerminalIme] for how the keyboard types into it. It takes no window insets:
 * the host lays it out and tells the page what is out of sight
 * (`lpmSetInsets`), as iOS turns off the web view's own inset adjustment.
 *
 * A tap takes focus, so the keyboard the page asks for when it focuses its input
 * opens on this view; a scroll or a hold leaves focus where it is, as does the tap
 * that puts a selection away.
 *
 * A hold selects with the page's own selection (select.js), so the WebView's long
 * press — its text selection, context menu and buzz — is off.
 */
internal class TerminalInputWebView(context: Context) : WebView(context) {
    var page: TerminalPage? = null

    /** The page has text selected, with its bar up. */
    var selecting = false
    private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
    private val longPress = ViewConfiguration.getLongPressTimeout()
    private var downX = 0f
    private var downY = 0f

    init {
        setOnLongClickListener { true }
        isHapticFeedbackEnabled = false
    }

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downX = event.x
                downY = event.y
            }

            MotionEvent.ACTION_UP -> {
                val tap = hypot(event.x - downX, event.y - downY) < touchSlop &&
                    event.eventTime - event.downTime < longPress
                when {
                    !tap -> Unit
                    selecting -> selecting = false
                    !hasFocus() -> requestFocus()
                }
            }
        }
        return super.dispatchTouchEvent(event)
    }

    override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection? {
        val connection = super.onCreateInputConnection(outAttrs) ?: return null
        TerminalIme.configure(outAttrs)
        return connection
    }

    override fun dispatchApplyWindowInsets(insets: WindowInsets): WindowInsets = insets
}

/**
 * The keyboard types into xterm as key events. Offered a text field, an Android
 * keyboard commits text instead, which reaches the page as a `keydown` 229 and a
 * separate commit; xterm.js reads it by diffing its textarea a task later, and
 * under fast typing that diff runs between the two and drops characters. With
 * TYPE_NULL the keyboard sends key events, which the page reads as real
 * keystrokes, as iOS delivers them; it also turns off suggestions, autocorrect
 * and auto-capitals. No full-screen landscape editor either.
 */
internal object TerminalIme {
    fun configure(outAttrs: EditorInfo) {
        outAttrs.inputType = InputType.TYPE_NULL
        outAttrs.imeOptions =
            outAttrs.imeOptions or EditorInfo.IME_FLAG_NO_FULLSCREEN or
            EditorInfo.IME_FLAG_NO_EXTRACT_UI
    }
}

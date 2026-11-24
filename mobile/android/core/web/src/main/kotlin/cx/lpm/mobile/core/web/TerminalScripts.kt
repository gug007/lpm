package cx.lpm.mobile.core.web

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive

/**
 * The calls into terminal.html, the same ones the iOS view makes. Output and
 * composed text cross as base64(UTF-8), so nothing needs escaping.
 */
internal object TerminalScripts {
    /** The handlers WebTerminalView registers, i.e. every `post(…)` in terminal.html. */
    val handlers =
        listOf("input", "resize", "ready", "openPath", "openURL", "extent", "find", "selection")

    const val REVIVE = "window.lpmRevive()"
    const val SNAPSHOT = "window.lpmSnapshot()"
    const val FOCUS = "document.querySelector('textarea')?.focus()"
    const val BLUR = "document.activeElement?.blur()"

    fun feed(bytes: ByteArray) = "window.lpmFeed('${JsLiteral.base64(bytes)}')"

    /** `cols` is the PTY's width, which the replay was drawn at. */
    fun seed(data: String, cols: Int) = "window.lpmSeed('${JsLiteral.base64(data)}', $cols)"

    fun showSaved(text: String) = "window.lpmShowSaved('${JsLiteral.base64(text)}')"

    fun submit(text: String) = "window.lpmSubmit('${JsLiteral.base64(text)}')"

    fun setInsets(top: Int, bottom: Int) = "window.lpmSetInsets($top, $bottom)"

    fun setFontSize(px: Int) = "window.lpmSetFontSize($px)"

    fun setTheme(theme: TerminalTheme) = with(theme) {
        "window.lpmSetTheme('$background','$foreground','$cursor','$selection')"
    }

    fun capture(lines: Int) = "window.lpmCapture($lines)"

    /** `step` is "type" while the query is typed, else "next" or "prev". */
    fun find(query: String, step: String) = "window.lpmFind('${JsLiteral.base64(query)}', '$step')"

    const val FIND_CLEAR = "window.lpmFindClear()"

    /** `evaluateJavascript` hands results back as JSON; anything but a string reads as "". */
    fun captured(result: String?): String {
        val value = try {
            result?.let(Json::parseToJsonElement)
        } catch (_: IllegalArgumentException) {
            null
        }
        return (value as? JsonPrimitive)?.takeIf { it.isString }?.content ?: ""
    }
}

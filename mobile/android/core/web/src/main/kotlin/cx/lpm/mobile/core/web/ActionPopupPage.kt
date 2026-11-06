package cx.lpm.mobile.core.web

import android.content.Context

/**
 * The script a popup page gets from the app (PROTOCOL.md, Action popups):
 * `web/popup/bootstrap.js` with its payload in place, put in the page's HTML ahead of
 * the page's own scripts.
 */
internal object ActionPopupPage {
    private const val TOKEN = "__LPM_POPUP_PAYLOAD__"
    private const val BOOTSTRAP = "web/popup/bootstrap.js"

    private val head = Regex("<head(\\s[^>]*)?>", RegexOption.IGNORE_CASE)
    private val html = Regex("<html(\\s[^>]*)?>", RegexOption.IGNORE_CASE)
    private val doctype = Regex("<!doctype[^>]*>", RegexOption.IGNORE_CASE)

    @Volatile private var template: String? = null

    fun template(context: Context): String = template ?: context.assets.open(BOOTSTRAP)
        .use { it.readBytes().toString(Charsets.UTF_8) }
        .also { template = it }

    /** [template] calling itself with [payload], the JSON `window.lpm` starts from. */
    fun bootstrap(template: String, payload: String): String {
        val at = template.lastIndexOf(TOKEN)
        if (at < 0) return template
        return template.substring(0, at) + payload + template.substring(at + TOKEN.length)
    }

    /**
     * [page] with [script] first in its head: after the opening `<head>`, else the
     * opening `<html>`, else the doctype, else at the very start.
     */
    fun withScript(page: String, script: String): String {
        val at = (head.find(page) ?: html.find(page) ?: doctype.find(page))
            ?.range?.last?.plus(1) ?: 0
        return page.substring(0, at) + "<script>" + script + "</script>" + page.substring(at)
    }
}

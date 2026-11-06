package cx.lpm.mobile.core.web

import android.annotation.SuppressLint
import android.graphics.Color
import android.util.Log
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.viewinterop.AndroidView

/**
 * An action popup's page (iOS `ActionPopupWebView`): the Mac's HTML loaded with no
 * base URL, `bootstrap.js` run before its own scripts, and nothing more. The page gets
 * no bridge to the app and can't navigate away: a tapped web link opens outside the
 * app, anything else is dropped. A refresh that keeps the page ([pushes] changes, not
 * [page]) hands its new values to `window.__lpmPush` without reloading it. A renderer
 * that dies reports [onFailure] and is never touched again.
 *
 * @param payload what `window.lpm` starts with, as JSON.
 * @param push the values the last refresh brought, as JSON.
 */
@Composable
fun ActionPopupWebView(
    html: String,
    payload: String,
    push: String,
    page: Int,
    pushes: Int,
    onFailure: () -> Unit,
    modifier: Modifier = Modifier
) {
    val host = remember { PopupHost() }
    val uriHandler = LocalUriHandler.current
    val failure by rememberUpdatedState(onFailure)
    AndroidView(
        factory = { context ->
            WebView(context).apply {
                applyLpmSettings()
                setBackgroundColor(Color.TRANSPARENT)
                webViewClient = PopupWebClient(
                    openInBrowser = { url -> uriHandler.openInBrowser(url) },
                    onGone = {
                        host.dead = true
                        failure()
                    }
                )
            }
        },
        modifier = modifier,
        onRelease = { web ->
            web.stopLoading()
            web.destroy()
        },
        update = { web ->
            if (host.dead) return@AndroidView
            if (host.page != page) {
                host.page = page
                host.pushes = pushes
                val script = ActionPopupPage.bootstrap(
                    ActionPopupPage.template(web.context),
                    payload
                )
                web.loadDataWithBaseURL(
                    null,
                    ActionPopupPage.withScript(html, script),
                    "text/html",
                    "utf-8",
                    null
                )
            } else if (host.pushes != pushes) {
                host.pushes = pushes
                web.evaluateJavascript("window.__lpmPush && window.__lpmPush($push);", null)
            }
        }
    )
}

/** What the web view last loaded, and whether its renderer is gone. */
private class PopupHost {
    var page = -1
    var pushes = 0
    var dead = false
}

/**
 * Keeps a popup on its first load: a tapped web link opens in the browser, a frame
 * inside the page may load what a page can, and every other navigation is dropped.
 */
// onRenderProcessGone is implemented below; the detector reads Kotlin's
// supertype constructor call as a bare WebViewClient.
@SuppressLint("MissingOnRenderProcessGone")
internal class PopupWebClient(
    private val openInBrowser: (String) -> Unit,
    private val onGone: () -> Unit
) : WebViewClient() {
    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        val url = request.url
        return when (popupNavigation(url.scheme, request.isForMainFrame, request.hasGesture())) {
            PopupNavigation.Allow -> false

            PopupNavigation.OpenOutside -> {
                openInBrowser(url.toString())
                true
            }

            PopupNavigation.Drop -> true
        }
    }

    /**
     * The renderer died. Returning true keeps the app alive; the WebView itself is
     * dead, and the sheet shows an error in its place.
     */
    override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
        Log.w(WEB_LOG_TAG, "Popup renderer gone (crashed: ${detail.didCrash()})")
        onGone()
        return true
    }
}

/** What a popup does with a navigation it didn't start itself. */
internal enum class PopupNavigation { Allow, OpenOutside, Drop }

/**
 * A tapped web link opens outside the app; a frame inside the page may load a web,
 * `about:`, `data:` or `blob:` URL; anything else, and any other move of the page
 * itself, is dropped.
 */
internal fun popupNavigation(
    scheme: String?,
    mainFrame: Boolean,
    tapped: Boolean
): PopupNavigation {
    val s = scheme?.lowercase()
    val web = s == "http" || s == "https"
    return when {
        tapped -> if (web) PopupNavigation.OpenOutside else PopupNavigation.Drop
        mainFrame -> PopupNavigation.Drop
        web || s in FRAME_SCHEMES -> PopupNavigation.Allow
        else -> PopupNavigation.Drop
    }
}

private val FRAME_SCHEMES = setOf("about", "data", "blob")

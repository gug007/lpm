package cx.lpm.mobile.feature.actions.popup

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import cx.lpm.mobile.core.designsystem.theme.LpmColors
import cx.lpm.mobile.core.model.ActionPopupContent
import java.util.Locale
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/**
 * What a popup page's scripts read as `window.lpm`, and the values a refresh hands to
 * `window.__lpmPush` (iOS `ActionPopupPayload`), as JSON safe to put in a script.
 */
internal object ActionPopupPayload {
    fun bootstrap(
        content: ActionPopupContent,
        project: String,
        action: String,
        colors: LpmColors
    ): String = script(
        buildJsonObject {
            put("data", content.data)
            put("text", content.text)
            put("error", content.dataError)
            put("theme", theme(colors))
            put("project", project)
            put("action", action)
        }
    )

    fun push(content: ActionPopupContent): String = script(
        buildJsonObject {
            put("data", content.data)
            put("text", content.text)
            put("error", content.dataError)
        }
    )

    /** lpm Link's own colors, as a sheet shows them in this appearance. */
    fun theme(colors: LpmColors): JsonObject = buildJsonObject {
        put("mode", if (colors.isDark) "dark" else "light")
        putJsonObject("colors") {
            put("bg", css(colors.systemGroupedBackground))
            put("surface", css(colors.secondarySystemGroupedBackground))
            put("text", css(colors.label))
            put("muted", css(colors.secondaryLabel))
            put("border", css(colors.separator))
            put("accent", css(colors.tint))
            put("green", css(colors.green))
            put("red", css(colors.red))
            put("amber", css(colors.orange))
        }
    }

    /** `#rrggbb`, or `rgba(r, g, b, a)` for a color that isn't opaque. */
    fun css(color: Color): String {
        val argb = color.toArgb()
        val r = argb shr 16 and 0xff
        val g = argb shr 8 and 0xff
        val b = argb and 0xff
        val alpha = (argb ushr 24) / 255f
        return if (alpha >= 0.995f) {
            String.format(Locale.ROOT, "#%02x%02x%02x", r, g, b)
        } else {
            String.format(Locale.ROOT, "rgba(%d, %d, %d, %.2f)", r, g, b, alpha)
        }
    }

    /** No `<` can end the script it lands in, and no line separator can end a line of it. */
    private fun script(json: JsonObject): String = json.toString()
        .replace("<", "\\u003c")
        .replace(" ", "\\u2028")
        .replace(" ", "\\u2029")
}

package cx.lpm.mobile.core.data.tips

import cx.lpm.mobile.core.data.prefs.AppPreferences
import cx.lpm.mobile.core.data.prefs.PreferenceKeys
import cx.lpm.mobile.core.model.AppTip
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/** Which tips were closed, kept on this phone (iOS `TipsStore`). Settings › Tips shows them again. */
@Singleton
class TipsStore @Inject constructor(private val prefs: AppPreferences) {
    /** The ids of the tips closed so far. */
    val closed: Flow<Set<String>> = prefs.data.map { read() }.distinctUntilChanged()

    fun close(tip: AppTip) = write(read() + tip.id)

    fun reset() = write(emptySet())

    private fun read(): Set<String> {
        val raw = prefs.string(PreferenceKeys.TIPS_CLOSED) ?: return emptySet()
        val list = runCatching { Json.parseToJsonElement(raw) as? JsonArray }.getOrNull()
        return list.orEmpty().mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.toSet()
    }

    private fun write(ids: Set<String>) = prefs.setString(
        PreferenceKeys.TIPS_CLOSED,
        JsonArray(ids.sorted().map(::JsonPrimitive)).toString()
    )
}

/** The first of [tips] still to show, so a screen shows one tip at a time. */
fun Set<String>.firstOpen(tips: List<AppTip>): AppTip? = tips.firstOrNull { it.id !in this }

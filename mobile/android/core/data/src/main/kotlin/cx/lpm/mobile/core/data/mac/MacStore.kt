package cx.lpm.mobile.core.data.mac

import cx.lpm.mobile.core.data.prefs.AppPreferences
import cx.lpm.mobile.core.data.prefs.PreferenceKeys
import cx.lpm.mobile.core.model.DEFAULT_MAC_PORT
import cx.lpm.mobile.core.model.WakeTarget
import cx.lpm.mobile.core.model.int
import cx.lpm.mobile.core.model.long
import cx.lpm.mobile.core.model.obj
import cx.lpm.mobile.core.model.objects
import cx.lpm.mobile.core.model.string
import cx.lpm.mobile.core.model.strings
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * The saved-Macs list (`lpm.macs`, JSON) and which one is active (`lpm.activeMacId`).
 * Credentials live per Mac in [CredentialStore], keyed by `MacRecord.localId`.
 */
@Singleton
class MacStore @Inject constructor(private val prefs: AppPreferences) {
    fun loadRecords(): List<MacRecord> {
        val text = prefs.string(PreferenceKeys.MACS) ?: return emptyList()
        val array = try {
            Json.parseToJsonElement(text) as? JsonArray
        } catch (e: SerializationException) {
            null
        } ?: return emptyList()
        return array.mapNotNull { (it as? JsonObject)?.let(::decode) }
    }

    fun saveRecords(records: List<MacRecord>) {
        prefs.setString(PreferenceKeys.MACS, JsonArray(records.map(::encode)).toString())
    }

    fun loadActiveId(): String? = prefs.string(PreferenceKeys.ACTIVE_MAC_ID)

    fun saveActiveId(id: String?) {
        prefs.setString(PreferenceKeys.ACTIVE_MAC_ID, id)
    }

    private fun encode(r: MacRecord): JsonObject = buildJsonObject {
        put("localId", r.localId)
        r.serverId?.let { put("serverId", it) }
        put("name", r.name)
        r.customName?.let { put("customName", it) }
        put("hosts", JsonArray(r.hosts.map { JsonPrimitive(it) }))
        put("port", r.port)
        r.platform?.let { put("platform", it) }
        r.lastConnected?.let { put("lastConnected", it.toEpochMilli()) }
        r.farewell?.let {
            put(
                "farewell",
                buildJsonObject {
                    put("reason", it.reason.rawValue)
                    put("at", it.at.toEpochMilli())
                }
            )
        }
        r.via?.let {
            put(
                "via",
                buildJsonObject {
                    put("macId", it.macId)
                    put("slug", it.slug)
                }
            )
        }
        r.wake?.let { targets -> put("wake", JsonArray(targets.map(WakeTarget::toJson))) }
    }

    private fun decode(o: JsonObject): MacRecord? {
        val localId = o.string("localId") ?: return null
        return MacRecord(
            localId = localId,
            serverId = o.string("serverId"),
            name = o.string("name") ?: return null,
            customName = o.string("customName"),
            hosts = o.strings("hosts") ?: return null,
            port = o.int("port") ?: DEFAULT_MAC_PORT,
            platform = o.string("platform"),
            lastConnected = o.long("lastConnected")?.let(Instant::ofEpochMilli),
            farewell = o.obj("farewell")?.let { f ->
                val reason = Farewell.Reason.of(f.string("reason").orEmpty())
                val at = f.long("at")
                if (reason != null &&
                    at != null
                ) {
                    Farewell(reason, Instant.ofEpochMilli(at))
                } else {
                    null
                }
            },
            via = o.obj("via")?.let { v ->
                val macId = v.string("macId")
                val slug = v.string("slug")
                if (macId != null && slug != null) MacVia(macId, slug) else null
            },
            wake = o.objects("wake")?.mapNotNull(WakeTarget::parse)?.ifEmpty { null }
        )
    }
}

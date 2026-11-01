package cx.lpm.mobile.core.data.mac

import cx.lpm.mobile.core.model.AutoPullMode
import cx.lpm.mobile.core.model.CustomWorkStatus
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.model.ProjectFolder
import cx.lpm.mobile.core.model.defaultWorkStatusPalette
import cx.lpm.mobile.core.model.long
import cx.lpm.mobile.core.model.string
import cx.lpm.mobile.core.protocol.Inbound
import java.io.File
import java.io.IOException
import java.time.Clock
import java.time.Instant
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * The last project list each Mac sent, kept in the cache dir so the app opens on
 * something to read even when the Mac can't be reached, marked with when it was
 * last current. Stores the frames exactly as they arrived and reads them back
 * through the normal parser, so the saved list can never drift from the live one.
 */
class ProjectSnapshots(
    private val dir: File,
    private val scope: CoroutineScope,
    private val io: CoroutineDispatcher,
    private val clock: Clock
) {
    data class Snapshot(
        val projects: List<Project> = emptyList(),
        val workStatuses: List<CustomWorkStatus> = defaultWorkStatusPalette,
        val workStatusOrder: List<String> = emptyList(),
        val autoPullMode: AutoPullMode = AutoPullMode.Off,
        val sidebarOrder: List<String> = emptyList(),
        val groups: List<ProjectFolder> = emptyList(),
        val pins: List<String> = emptyList(),
        val at: Instant
    )

    private data class Stored(val projects: String?, val sidebar: String?, val at: Instant)

    private val cache = mutableMapOf<String, Stored?>()
    private val dirty = mutableSetOf<String>()
    private var flush: Job? = null

    /** Keep a `projects` or `sidebar` frame for `mac`, written shortly after a burst. */
    fun record(text: String, mac: String) {
        val entry = entry(mac) ?: Stored(null, null, clock.instant())
        val next = if (text.contains("\"t\":\"sidebar\"")) {
            entry.copy(sidebar = text)
        } else {
            entry.copy(projects = text)
        }
        save(next.copy(at = clock.instant()), mac)
    }

    /** Stamp the saved list as current up to `at`, the last time the link was live. */
    fun touch(mac: String, at: Instant) {
        val entry = entry(mac) ?: return
        save(entry.copy(at = at), mac)
    }

    fun load(mac: String): Snapshot? {
        val entry = entry(mac) ?: return null
        val list = entry.projects?.let(Inbound::parse) as? Inbound.Projects ?: return null
        val sidebar = entry.sidebar?.let(Inbound::parse) as? Inbound.Sidebar
        return Snapshot(
            projects = list.projects,
            workStatuses = list.workStatuses,
            workStatusOrder = list.workStatusOrder,
            autoPullMode = list.autoPullMode,
            sidebarOrder = sidebar?.order.orEmpty(),
            groups = sidebar?.groups.orEmpty(),
            pins = sidebar?.pins.orEmpty(),
            at = entry.at
        )
    }

    fun remove(mac: String) {
        cache[mac] = null
        dirty.remove(mac)
        val file = file(mac)
        scope.launch(io) { file.delete() }
    }

    private fun entry(mac: String): Stored? {
        if (cache.containsKey(mac)) return cache[mac]
        val read = read(file(mac))
        cache[mac] = read
        return read
    }

    private fun save(entry: Stored, mac: String) {
        cache[mac] = entry
        dirty += mac
        flush?.cancel()
        flush = scope.launch {
            delay(FLUSH_DELAY_MS)
            val batch = dirty.mapNotNull { id -> cache[id]?.let { id to it } }
            dirty.clear()
            withContext(io) { batch.forEach { (id, stored) -> write(stored, file(id)) } }
        }
    }

    private fun file(mac: String) = File(dir, "$mac.json")

    private fun read(file: File): Stored? {
        val text = try {
            file.takeIf { it.exists() }?.readText()
        } catch (e: IOException) {
            null
        } ?: return null
        val o = try {
            Json.parseToJsonElement(text) as? JsonObject
        } catch (e: SerializationException) {
            null
        } ?: return null
        val at = o.long("at") ?: return null
        return Stored(o.string("projects"), o.string("sidebar"), Instant.ofEpochMilli(at))
    }

    private fun write(stored: Stored, file: File) {
        val json = buildJsonObject {
            stored.projects?.let { put("projects", it) }
            stored.sidebar?.let { put("sidebar", it) }
            put("at", stored.at.toEpochMilli())
        }
        try {
            file.parentFile?.mkdirs()
            val tmp = File(file.parentFile, file.name + ".tmp")
            tmp.writeText(json.toString())
            if (!tmp.renameTo(file)) tmp.delete()
        } catch (e: IOException) {
            file.delete()
        }
    }

    private companion object {
        const val FLUSH_DELAY_MS = 2_000L
    }
}

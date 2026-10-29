package cx.lpm.mobile.core.data.prefs

import cx.lpm.mobile.core.data.push.QuietHours
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Which pushes this phone asks its Macs for (Settings → Notifications). The kinds
 * keep their own values while [enabled] is off; what a Mac is told is
 * `enabled && kind`. Absent keys read as on, so a fresh install opts in to every
 * push that reports something to act on — except an automation starting, which only
 * announces work the user already scheduled. [liveActivity] — the ongoing
 * notification of the agents at work — stands on its own.
 */
data class NotificationPrefs(
    val enabled: Boolean = true,
    val waiting: Boolean = true,
    val done: Boolean = true,
    val error: Boolean = true,
    val automationStarted: Boolean = false,
    val automationDone: Boolean = true,
    val automationError: Boolean = true,
    /** Monday's "Your week in lpm is ready", from each Mac. */
    val weeklyRecap: Boolean = true,
    val liveActivity: Boolean = true,
    /** Projects heard less about: "waiting" (only when it needs you) or "off", by name. */
    val projects: Map<String, String> = emptyMap(),
    val quiet: QuietHours = QuietHours()
)

val AppPreferences.notificationPrefs: NotificationPrefs
    get() {
        val defaults = NotificationPrefs()
        return NotificationPrefs(
            enabled = bool(PreferenceKeys.NOTIFY_ENABLED) ?: defaults.enabled,
            waiting = bool(PreferenceKeys.NOTIFY_WAITING) ?: defaults.waiting,
            done = bool(PreferenceKeys.NOTIFY_DONE) ?: defaults.done,
            error = bool(PreferenceKeys.NOTIFY_ERROR) ?: defaults.error,
            automationStarted = bool(PreferenceKeys.NOTIFY_AUTOMATION_STARTED)
                ?: defaults.automationStarted,
            automationDone = bool(PreferenceKeys.NOTIFY_AUTOMATION_DONE) ?: defaults.automationDone,
            automationError = bool(PreferenceKeys.NOTIFY_AUTOMATION_ERROR)
                ?: defaults.automationError,
            weeklyRecap = bool(PreferenceKeys.NOTIFY_WEEKLY_RECAP) ?: defaults.weeklyRecap,
            liveActivity = bool(PreferenceKeys.NOTIFY_LIVE_ACTIVITY) ?: defaults.liveActivity,
            projects = projectLevels(string(PreferenceKeys.NOTIFY_PROJECTS)),
            quiet = QuietHours(
                enabled = bool(PreferenceKeys.NOTIFY_QUIET_ENABLED) ?: defaults.quiet.enabled,
                start = int(PreferenceKeys.NOTIFY_QUIET_START) ?: defaults.quiet.start,
                end = int(PreferenceKeys.NOTIFY_QUIET_END) ?: defaults.quiet.end,
                letWaitingThrough = bool(PreferenceKeys.NOTIFY_QUIET_WAITING)
                    ?: defaults.quiet.letWaitingThrough
            )
        )
    }

/** The levels map, stored as a JSON object (iOS keeps a dictionary under the same key). */
private fun projectLevels(json: String?): Map<String, String> {
    if (json.isNullOrEmpty()) return emptyMap()
    val obj = try {
        Json.parseToJsonElement(json) as? JsonObject
    } catch (e: SerializationException) {
        null
    } ?: return emptyMap()
    return obj.mapNotNull { (project, level) ->
        (level as? JsonPrimitive)?.takeIf { it.isString }?.let { project to it.content }
    }.toMap()
}

fun AppPreferences.notificationPrefsFlow(): Flow<NotificationPrefs> =
    data.map { notificationPrefs }.distinctUntilChanged()

/** Stores every kind, as iOS does on any change, so all nine keys hold a value after. */
fun AppPreferences.setNotificationPrefs(prefs: NotificationPrefs) {
    setBool(PreferenceKeys.NOTIFY_ENABLED, prefs.enabled)
    setBool(PreferenceKeys.NOTIFY_WAITING, prefs.waiting)
    setBool(PreferenceKeys.NOTIFY_DONE, prefs.done)
    setBool(PreferenceKeys.NOTIFY_ERROR, prefs.error)
    setBool(PreferenceKeys.NOTIFY_AUTOMATION_STARTED, prefs.automationStarted)
    setBool(PreferenceKeys.NOTIFY_AUTOMATION_DONE, prefs.automationDone)
    setBool(PreferenceKeys.NOTIFY_AUTOMATION_ERROR, prefs.automationError)
    setBool(PreferenceKeys.NOTIFY_WEEKLY_RECAP, prefs.weeklyRecap)
    setBool(PreferenceKeys.NOTIFY_LIVE_ACTIVITY, prefs.liveActivity)
    setString(
        PreferenceKeys.NOTIFY_PROJECTS,
        JsonObject(prefs.projects.mapValues { JsonPrimitive(it.value) }).toString()
    )
    setBool(PreferenceKeys.NOTIFY_QUIET_ENABLED, prefs.quiet.enabled)
    setInt(PreferenceKeys.NOTIFY_QUIET_START, prefs.quiet.start)
    setInt(PreferenceKeys.NOTIFY_QUIET_END, prefs.quiet.end)
    setBool(PreferenceKeys.NOTIFY_QUIET_WAITING, prefs.quiet.letWaitingThrough)
}

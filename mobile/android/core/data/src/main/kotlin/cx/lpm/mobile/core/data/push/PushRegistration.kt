package cx.lpm.mobile.core.data.push

import cx.lpm.mobile.core.data.prefs.NotificationPrefs
import java.security.MessageDigest
import java.util.Base64

/**
 * Everything a Mac is told about this phone's push identity (iOS
 * `PushRegistrar.Payload`): the token, its platform, the shared push key, the
 * effective preferences and whether it wants live updates (told only to a Mac that
 * offers them). The same for every Mac; only the destination differs.
 */
data class PushRegistration(
    val platform: String,
    val token: String,
    val key: String,
    val waiting: Boolean,
    val done: Boolean,
    val error: Boolean,
    val automationStarted: Boolean,
    val automationDone: Boolean,
    val automationError: Boolean,
    val weeklyRecap: Boolean,
    val live: Boolean,
    /** Projects heard less about: "waiting" or "off", by project name. */
    val projects: Map<String, String> = emptyMap()
) {
    /**
     * A digest of everything a Mac holds, so a Mac is contacted again exactly when
     * something it holds has changed. Hashed: the push key is a secret and the
     * preferences store isn't a secret store.
     */
    val signature: String
        get() {
            val bits = listOf(
                waiting,
                done,
                error,
                automationStarted,
                automationDone,
                automationError,
                weeklyRecap,
                live
            )
                .joinToString("") { if (it) "1" else "0" }
            // Levels only when set, so a phone without any keeps the signature it had.
            val levels = projects.toSortedMap().entries.joinToString(",") {
                "${it.key}=${it.value}"
            }
            val material = "$token|$platform|$key|$bits" + if (levels.isEmpty()) "" else "|$levels"
            val digest = MessageDigest.getInstance("SHA-256").digest(material.encodeToByteArray())
            return digest.joinToString("") { "%02x".format(it) }
        }

    companion object {
        /** What the kinds amount to: each one only while push as a whole is on. */
        fun of(platform: String, token: String, key: ByteArray, prefs: NotificationPrefs) =
            PushRegistration(
                platform = platform,
                token = token,
                key = Base64.getEncoder().encodeToString(key),
                waiting = prefs.enabled && prefs.waiting,
                done = prefs.enabled && prefs.done,
                error = prefs.enabled && prefs.error,
                automationStarted = prefs.enabled && prefs.automationStarted,
                automationDone = prefs.enabled && prefs.automationDone,
                automationError = prefs.enabled && prefs.automationError,
                weeklyRecap = prefs.enabled && prefs.weeklyRecap,
                live = prefs.liveActivity,
                projects = if (prefs.enabled) prefs.projects else emptyMap()
            )
    }
}

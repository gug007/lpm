package cx.lpm.mobile.core.data.share

import cx.lpm.mobile.core.data.prefs.AppPreferences
import cx.lpm.mobile.core.data.prefs.PreferenceKeys
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The share sheet's last choices (iOS `ShareDirectory.Choice`), so the next share
 * starts where this one ended: the Mac's server id, the project, "agent" or "notes",
 * and the agent.
 */
@Singleton
class ShareChoices @Inject constructor(private val prefs: AppPreferences) {
    var mac: String?
        get() = prefs.string(PreferenceKeys.SHARE_MAC)
        set(value) {
            prefs.setString(PreferenceKeys.SHARE_MAC, value)
        }

    var project: String?
        get() = prefs.string(PreferenceKeys.SHARE_PROJECT)
        set(value) {
            prefs.setString(PreferenceKeys.SHARE_PROJECT, value)
        }

    var destination: String?
        get() = prefs.string(PreferenceKeys.SHARE_DESTINATION)
        set(value) {
            prefs.setString(PreferenceKeys.SHARE_DESTINATION, value)
        }

    var agent: String?
        get() = prefs.string(PreferenceKeys.SHARE_AGENT)
        set(value) {
            prefs.setString(PreferenceKeys.SHARE_AGENT, value)
        }

    /** The share sheet may have started the process. */
    suspend fun load() = prefs.load()
}

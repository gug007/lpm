package cx.lpm.mobile.core.data.review

import cx.lpm.mobile.core.data.prefs.AppPreferences
import cx.lpm.mobile.core.data.session.MacSession

/**
 * When to ask for a rating (iOS `ReviewAsk`): after the phone has done real work for
 * someone (an agent answered, a commit pushed, a pull request merged) five times, once
 * per version, never in Demo Mode. Play decides whether the prompt shows.
 */
object ReviewAsk {
    const val WINS_BEFORE_ASKING = 5
    private const val WINS_KEY = "reviewAsk.wins"
    private const val ASKED_VERSION_KEY = "reviewAsk.askedVersion"

    fun win(prefs: AppPreferences) {
        prefs.setInt(WINS_KEY, (prefs.int(WINS_KEY) ?: 0) + 1)
    }

    fun due(prefs: AppPreferences, version: String): Boolean =
        (prefs.int(WINS_KEY) ?: 0) >= WINS_BEFORE_ASKING &&
            prefs.string(ASKED_VERSION_KEY) != version

    fun asked(prefs: AppPreferences, version: String) {
        prefs.setString(ASKED_VERSION_KEY, version)
        prefs.setInt(WINS_KEY, 0)
    }
}

/** A commit, push or merge this phone made went through. */
internal fun MacSession.noteWin() {
    if (!state.value.demoMode) ReviewAsk.win(preferences)
}

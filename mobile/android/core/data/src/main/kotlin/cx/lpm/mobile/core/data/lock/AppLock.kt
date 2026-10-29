package cx.lpm.mobile.core.data.lock

import cx.lpm.mobile.core.data.prefs.AppPreferences
import cx.lpm.mobile.core.data.prefs.PreferenceKeys
import java.time.Clock
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** What checks the phone's owner: the activity's biometric prompt, with the screen lock as fallback. */
interface OwnerCheck {
    /** False when the phone has no screen lock at all, so there's nothing to check against. */
    fun available(): Boolean

    suspend fun check(reason: String): Boolean
}

/**
 * The app's own lock (iOS `AppLock`), off unless turned on in Settings › Security: the
 * phone's screen lock to open lpm Link after it has been away, and, separately, before
 * the actions that are hard to take back.
 */
@Singleton
class AppLock @Inject constructor(private val prefs: AppPreferences, private val clock: Clock) {
    data class State(
        val enabled: Boolean = false,
        /** Seconds away before it locks again. */
        val after: Int = 0,
        val confirmRisky: Boolean = false,
        val locked: Boolean = false,
        /** Whether the phone has a screen lock to check with. */
        val available: Boolean = true
    )

    private val mutable = MutableStateFlow(State())
    val state: StateFlow<State> = mutable.asStateFlow()

    private var check: OwnerCheck? = null
    private var leftAt: Long? = null
    private var unlocking = false

    /** Reads the stored settings; locked from the start when the lock is on. */
    fun load() {
        val enabled = prefs.bool(PreferenceKeys.LOCK_ENABLED) ?: false
        mutable.value = State(
            enabled = enabled,
            after = prefs.int(PreferenceKeys.LOCK_AFTER) ?: 0,
            confirmRisky = prefs.bool(PreferenceKeys.LOCK_CONFIRM_RISKY) ?: false,
            locked = enabled,
            available = check?.available() ?: true
        )
    }

    /** The activity hands over its prompt while it's alive. */
    fun attach(check: OwnerCheck?) {
        this.check = check
        mutable.update { it.copy(available = check?.available() ?: true) }
    }

    fun onBackground() {
        if (leftAt == null) leftAt = clock.millis()
    }

    fun onForeground(scope: CoroutineScope) {
        val s = state.value
        val away = leftAt?.let { clock.millis() - it } ?: 0
        leftAt = null
        if (s.enabled && away >= s.after * 1000L &&
            away > 0
        ) {
            mutable.update { it.copy(locked = true) }
        }
        if (state.value.locked) scope.launch { unlock() }
    }

    suspend fun unlock() {
        if (!state.value.locked || unlocking) return
        unlocking = true
        try {
            if (passes("Unlock lpm Link")) mutable.update { it.copy(locked = false) }
        } finally {
            unlocking = false
        }
    }

    /** Turns the lock on once the owner proves they can open it. */
    suspend fun setEnabled(on: Boolean) {
        if (on && !passes("Turn on the lock for lpm Link")) return
        prefs.setBool(PreferenceKeys.LOCK_ENABLED, on)
        mutable.update { it.copy(enabled = on, locked = if (on) it.locked else false) }
    }

    fun setAfter(seconds: Int) {
        prefs.setInt(PreferenceKeys.LOCK_AFTER, seconds)
        mutable.update { it.copy(after = seconds) }
    }

    fun setConfirmRisky(on: Boolean) {
        prefs.setBool(PreferenceKeys.LOCK_CONFIRM_RISKY, on)
        mutable.update { it.copy(confirmRisky = on) }
    }

    /** Runs [action] straight away, or once the owner confirms when risky actions ask first. */
    fun confirm(scope: CoroutineScope, reason: String, action: () -> Unit) {
        if (!state.value.confirmRisky) return action()
        scope.launch { if (passes(reason)) action() }
    }

    private suspend fun passes(reason: String): Boolean {
        val check = check ?: return false
        if (!check.available()) return true
        return check.check(reason)
    }

    companion object {
        val AFTER_CHOICES = listOf(0, 60, 300, 900)
    }
}

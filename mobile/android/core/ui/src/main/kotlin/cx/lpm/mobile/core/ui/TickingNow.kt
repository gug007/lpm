package cx.lpm.mobile.core.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.delay

private const val TICK_MS = 1_000L

/**
 * Unix millis, ticked every [periodMs] (a second unless said) while [enabled] — and only
 * while someone can read it: not behind a pushed screen, nor with the app in the background.
 */
@Composable
fun tickingNow(enabled: Boolean = true, periodMs: Long = TICK_MS): Long {
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val now by produceState(System.currentTimeMillis(), lifecycle, enabled, periodMs) {
        if (!enabled) return@produceState
        lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            while (true) {
                value = System.currentTimeMillis()
                delay(periodMs)
            }
        }
    }
    return now
}

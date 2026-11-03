package cx.lpm.mobile.core.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import cx.lpm.mobile.core.model.Haptic
import cx.lpm.mobile.core.model.HapticCue

/** Plays the cues that land while this shows (not one from before it showed). */
@Composable
fun HapticEffect(cue: HapticCue?) {
    val haptics = LocalHapticFeedback.current
    var played by remember { mutableStateOf(cue?.seq) }
    LaunchedEffect(cue) {
        val next = cue ?: return@LaunchedEffect
        if (next.seq == played) return@LaunchedEffect
        played = next.seq
        haptics.performHapticFeedback(
            when (next.haptic) {
                Haptic.Success -> HapticFeedbackType.Confirm
                Haptic.Error -> HapticFeedbackType.Reject
            }
        )
    }
}

package cx.lpm.mobile.core.model

/** What a finished change makes the phone feel (iOS `Haptics`). */
enum class Haptic { Success, Error }

/** A [haptic] for an open screen to play once, told apart from the last by [seq]. */
data class HapticCue(val haptic: Haptic, val seq: Int)

/** The cue that follows this one. */
fun HapticCue?.next(haptic: Haptic): HapticCue = HapticCue(haptic, (this?.seq ?: 0) + 1)

package cx.lpm.mobile.core.designsystem.theme

import androidx.compose.ui.graphics.Color

/** SwiftUI's `.opacity(_:)` on a color that already has some: the alphas multiply. */
fun Color.dimmed(opacity: Float): Color = copy(alpha = alpha * opacity)

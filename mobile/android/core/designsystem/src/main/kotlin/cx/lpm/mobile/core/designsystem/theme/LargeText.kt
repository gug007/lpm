package cx.lpm.mobile.core.designsystem.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.platform.LocalDensity

/** Text at the sizes where rows stack: a font scale from 1.5, Android's nearest to iOS's accessibility sizes. */
@Composable
@ReadOnlyComposable
fun isLargeText(): Boolean = LocalDensity.current.fontScale >= 1.5f

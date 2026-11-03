package cx.lpm.mobile.core.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color
import cx.lpm.mobile.core.designsystem.theme.LpmTheme

/** lpm commands read in lpm's own accent, the desktop's `--accent-cyan`. */
val lpmCommandTint: Color
    @Composable @ReadOnlyComposable
    get() = if (LpmTheme.colors.isDark) Color(0xFF22D3EE) else Color(0xFF06B6D4)

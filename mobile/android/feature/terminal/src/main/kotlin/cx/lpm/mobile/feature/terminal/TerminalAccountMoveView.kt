package cx.lpm.mobile.feature.terminal

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ActivityIndicatorSize
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.ui.providerMeta
import cx.lpm.mobile.core.ui.tint

/**
 * Covers a terminal while its Claude conversation moves to another account, as the
 * desktop covers the tab: the old session stopping and the new shell starting
 * underneath never show, only Claude back on the account picked.
 */
@Composable
internal fun TerminalAccountMoveView(
    account: String,
    background: Color,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxSize()
            .background(background),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically
    ) {
        ActivityIndicator(size = ActivityIndicatorSize.Regular, color = providerMeta("claude").tint)
        Text(
            text = stringResource(R.string.terminal_account_move, account),
            style = LpmTheme.typography.footnote,
            color = Color.White.copy(alpha = 0.5f)
        )
    }
}

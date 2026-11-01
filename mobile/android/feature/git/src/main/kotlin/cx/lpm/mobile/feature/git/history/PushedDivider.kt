package cx.lpm.mobile.feature.git.history

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cx.lpm.mobile.core.designsystem.component.PlainListDefaults
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.git.R

/** The line above the first commit a remote already has. */
@Composable
internal fun PushedDivider(modifier: Modifier = Modifier) {
    val colors = LpmTheme.colors
    val spoken = stringResource(R.string.git_history_pushed)
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = RowMinHeight)
            .padding(horizontal = PlainListDefaults.RowPadding)
            .clearAndSetSemantics { contentDescription = spoken },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Rule(Modifier.weight(1f))
        Text(
            text = stringResource(R.string.git_history_pushed_line),
            style = TextStyle(
                fontSize = 10.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 0.6.sp
            ),
            color = colors.secondaryLabel,
            maxLines = 1
        )
        Rule(Modifier.weight(1f))
    }
}

@Composable
private fun Rule(modifier: Modifier = Modifier) {
    Box(
        modifier
            .height(1.dp)
            .background(LpmTheme.colors.separator)
    )
}

/** A plain list row's least height on iOS. */
private val RowMinHeight = 44.dp

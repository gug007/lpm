package cx.lpm.mobile.core.designsystem.component

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.theme.LpmTheme

/**
 * A sheet's chrome as iOS draws a `NavigationStack` in a sheet: grouped background,
 * the centered [title] with an optional [titleTrailing] beside it, an optional
 * [leading] button ("Cancel") and the trailing "Done" glass capsule.
 */
@Composable
fun SheetScaffold(
    title: String,
    onDone: () -> Unit,
    modifier: Modifier = Modifier,
    doneLabel: String = "Done",
    doneEnabled: Boolean = true,
    leading: (@Composable () -> Unit)? = null,
    titleTrailing: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    Column(modifier.background(LpmTheme.colors.systemGroupedBackground)) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 16.dp, end = 16.dp, top = 16.dp)
                .height(44.dp)
        ) {
            if (leading != null) {
                Box(Modifier.align(Alignment.CenterStart)) { leading() }
            }
            Row(
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(horizontal = 96.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = title,
                    style = LpmTheme.typography.headline,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false)
                )
                titleTrailing?.invoke()
            }
            GlassCapsuleButton(
                text = doneLabel,
                onClick = onDone,
                enabled = doneEnabled,
                textStyle = LpmTheme.typography.headline,
                modifier = Modifier.align(Alignment.CenterEnd)
            )
        }
        content()
    }
}

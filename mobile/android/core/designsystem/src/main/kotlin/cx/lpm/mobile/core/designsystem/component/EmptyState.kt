package cx.lpm.mobile.core.designsystem.component

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.theme.LpmTheme

/**
 * iOS's `ContentUnavailableView`: a large gray symbol, a bold title, an optional
 * description and actions, centered in the space it's given.
 */
@Composable
fun EmptyState(
    title: String,
    icon: Painter,
    modifier: Modifier = Modifier,
    iconTint: Color = LpmTheme.colors.secondaryLabel,
    description: (@Composable () -> Unit)? = null,
    actions: (@Composable () -> Unit)? = null
) {
    Column(
        modifier = modifier.padding(horizontal = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            painter = icon,
            contentDescription = null,
            tint = iconTint,
            modifier = Modifier.size(56.dp)
        )
        Spacer(Modifier.height(12.dp))
        Text(
            text = title,
            style = LpmTheme.typography.title2.copy(fontWeight = FontWeight.Bold),
            textAlign = TextAlign.Center
        )
        if (description != null) {
            Spacer(Modifier.height(8.dp))
            description()
        }
        if (actions != null) {
            Spacer(Modifier.height(16.dp))
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) { actions() }
        }
    }
}

/** [EmptyState] with a [description] and, optionally, a `.borderedProminent` [action] button. */
@Composable
fun EmptyState(
    title: String,
    icon: Painter,
    description: String,
    modifier: Modifier = Modifier,
    action: String? = null,
    onAction: () -> Unit = {}
) {
    EmptyState(
        title = title,
        icon = icon,
        modifier = modifier,
        description = {
            Text(
                text = description,
                style = LpmTheme.typography.body,
                color = LpmTheme.colors.secondaryLabel,
                textAlign = TextAlign.Center
            )
        },
        actions = action?.let {
            {
                CapsuleButton(
                    text = it,
                    onClick = onAction,
                    prominent = true,
                    textStyle = LpmTheme.typography.headline
                )
            }
        }
    )
}

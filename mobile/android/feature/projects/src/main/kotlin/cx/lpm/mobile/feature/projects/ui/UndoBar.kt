package cx.lpm.mobile.feature.projects.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.projects.R

/**
 * The dark capsule an undoable change leaves at the bottom of the screen for a few
 * seconds: what happened, and Undo. It slides up while there's a [message] and away
 * once it's null. It holds still — a countdown that moves the whole time would keep
 * UI tests from tapping Undo.
 */
@Composable
fun UndoBar(
    message: String?,
    onUndo: () -> Unit,
    modifier: Modifier = Modifier,
    windowInsets: WindowInsets = WindowInsets(0)
) {
    AnimatedVisibility(
        visible = message != null,
        modifier = modifier,
        enter = slideInVertically { it } + fadeIn(),
        exit = slideOutVertically { it } + fadeOut()
    ) {
        val text = message ?: return@AnimatedVisibility
        Row(
            modifier = Modifier
                .windowInsetsPadding(windowInsets)
                .padding(horizontal = 20.dp, vertical = 8.dp)
                .fillMaxWidth()
                .shadow(12.dp, CircleShape)
                .background(Color(0xFF1F1F1F), CircleShape)
                .padding(start = 18.dp, end = 8.dp, top = 4.dp, bottom = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = text,
                style = LpmTheme.typography.subheadline.copy(fontWeight = FontWeight.Medium),
                color = Color.White,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f)
            )
            TextButton(
                onClick = onUndo,
                shape = CircleShape,
                modifier = Modifier.background(Color.White, CircleShape)
            ) {
                Text(
                    text = stringResource(R.string.tab_undo),
                    style = LpmTheme.typography.subheadline.copy(fontWeight = FontWeight.SemiBold),
                    color = Color.Black
                )
            }
        }
    }
}

package cx.lpm.mobile.feature.terminal.composer

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.onLongClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ContextMenu
import cx.lpm.mobile.core.designsystem.component.ContextMenuItem
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.terminal.R

/** The widest the last prompt gets; the field keeps clear of it, so a tap there types. */
internal val RecallMaxWidth = 120.dp

/**
 * Inside an empty composer: the last prompt sent in this tab, one tap from being
 * typed again. It sits in the field rather than on a row of its own, so the terminal
 * above never loses or regains rows (and the Mac's never resizes) as the field
 * empties and fills.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun ComposerRecallButton(
    prompt: String,
    onRecall: () -> Unit,
    onHistory: () -> Unit,
    modifier: Modifier = Modifier
) {
    var menu by remember { mutableStateOf(false) }
    val label = stringResource(R.string.composer_last_prompt)
    val hint = stringResource(R.string.composer_last_prompt_hint)
    val summary = remember(prompt) { prompt.lines().firstOrNull { it.isNotEmpty() } ?: prompt }
    val orange = LpmTheme.colors.orange
    Box(modifier) {
        Row(
            modifier = Modifier
                .widthIn(max = RecallMaxWidth)
                .defaultMinSize(minHeight = 30.dp)
                .clip(CircleShape)
                .background(Color.White.copy(alpha = 0.1f))
                .combinedClickable(onLongClick = { menu = true }, onClick = onRecall)
                .clearAndSetSemantics {
                    contentDescription = label
                    stateDescription = prompt
                    role = Role.Button
                    onClick(hint) {
                        onRecall()
                        true
                    }
                    onLongClick {
                        menu = true
                        true
                    }
                }
                .padding(horizontal = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                painterResource(DesignR.drawable.ic_replay),
                contentDescription = null,
                tint = orange,
                modifier = Modifier.size(14.dp)
            )
            Text(
                text = summary,
                style = LpmTheme.typography.footnote,
                color = orange,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        ContextMenu(expanded = menu, onDismissRequest = { menu = false }) {
            ContextMenuItem(
                title = stringResource(R.string.composer_use_last_prompt),
                icon = painterResource(DesignR.drawable.ic_replay),
                onClick = onRecall
            )
            ContextMenuItem(
                title = stringResource(R.string.composer_history),
                icon = painterResource(DesignR.drawable.ic_schedule),
                onClick = onHistory
            )
        }
    }
}

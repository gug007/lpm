package cx.lpm.mobile.feature.memory.list

import android.content.ClipData
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.memory.R
import kotlinx.coroutines.launch

private const val SKILL_COMMAND = "/lpm-memory"

/**
 * iOS's `MemorySkillHint`: the other way to start a memory session, under the
 * empty Memory screen's button — the skill an agent runs, with a copy button.
 */
@Composable
internal fun MemorySkillHint() {
    val clipboard = LocalClipboard.current
    val haptics = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()
    var copied by remember { mutableStateOf(false) }
    val copyLabel = stringResource(R.string.memory_skill_copy)
    Row(
        modifier = Modifier.padding(top = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = stringResource(R.string.memory_skill_hint),
            style = LpmTheme.typography.footnote,
            color = LpmTheme.colors.secondaryLabel
        )
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(6.dp))
                .border(1.dp, LpmTheme.colors.quaternaryLabel, RoundedCornerShape(6.dp))
                .clickable {
                    scope.launch {
                        clipboard.setClipEntry(
                            ClipEntry(ClipData.newPlainText(SKILL_COMMAND, SKILL_COMMAND))
                        )
                    }
                    haptics.performHapticFeedback(HapticFeedbackType.Confirm)
                    copied = true
                }
                .semantics { contentDescription = copyLabel }
                .padding(horizontal = 8.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = stringResource(R.string.memory_skill_command, SKILL_COMMAND),
                style = LpmTheme.typography.footnote.copy(fontFamily = FontFamily.Monospace),
                color = LpmTheme.colors.label
            )
            Icon(
                painter = painterResource(
                    if (copied) DesignR.drawable.ic_check else DesignR.drawable.ic_content_copy
                ),
                contentDescription = null,
                tint = LpmTheme.colors.label,
                modifier = Modifier.size(12.dp)
            )
        }
    }
}

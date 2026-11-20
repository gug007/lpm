package cx.lpm.mobile.feature.terminal.composer

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.terminal.R

/**
 * The answer the next prompt asks for, shown over the field while it's on, so it's
 * always in sight and one tap from undone. Kept in step with iOS's `ComposerAnswerChip`.
 */
@Composable
internal fun ComposerAnswerChip(
    kind: AnswerKind,
    onOff: () -> Unit,
    modifier: Modifier = Modifier
) {
    val accent = answerAccent
    val chip = stringResource(kind.chip)
    val description = "$chip, ${stringResource(R.string.answer_back_to_text)}"
    Row(
        modifier = modifier
            .clip(CircleShape)
            .background(accent.copy(alpha = 0.18f))
            .clickable(role = Role.Button, onClick = onOff)
            .semantics(mergeDescendants = true) { contentDescription = description }
            .padding(horizontal = 10.dp, vertical = 5.dp),
        horizontalArrangement = Arrangement.spacedBy(5.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(painterResource(kind.icon), null, tint = accent, modifier = Modifier.size(16.dp))
        Text(
            chip,
            color = accent,
            style = LpmTheme.typography.footnote,
            fontWeight = FontWeight.Medium
        )
        Icon(
            painterResource(DesignR.drawable.ic_close),
            null,
            tint = accent,
            modifier = Modifier.size(14.dp)
        )
    }
}

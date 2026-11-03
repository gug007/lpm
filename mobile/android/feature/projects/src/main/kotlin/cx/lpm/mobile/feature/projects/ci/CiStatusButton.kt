package cx.lpm.mobile.feature.projects.ci

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.component.clickableNoIndication
import cx.lpm.mobile.core.designsystem.component.glass
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.CiCheck
import cx.lpm.mobile.feature.projects.R

/**
 * The project's CI in the bar (iOS `CiStatusButton`), as the desktop footer's checks
 * pill shows it: red with how many fail, orange while running, a green check once
 * passed. Faded while local commits wait to be pushed.
 */
@Composable
internal fun CiStatusButton(
    state: GitChecksUiState,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val checks = state.checks ?: return
    val verdict = checks.verdict ?: return
    val description = stringResource(R.string.ci_status, checks.branch, checks.label)
    Row(
        modifier = modifier
            .height(44.dp)
            .glass(CircleShape, LpmTheme.colors)
            .clickableNoIndication(onClick = onClick)
            .semantics(mergeDescendants = true) { contentDescription = description }
            .padding(horizontal = 13.dp)
            .alpha(if (state.unpushedNote != null) 0.6f else 1f),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        CiStateIcon(verdict)
        if (verdict == CiCheck.State.FAIL) {
            Text(
                text = "${checks.failed}",
                style = LpmTheme.typography.footnote.copy(fontWeight = FontWeight.SemiBold),
                color = LpmTheme.colors.label
            )
        }
    }
}

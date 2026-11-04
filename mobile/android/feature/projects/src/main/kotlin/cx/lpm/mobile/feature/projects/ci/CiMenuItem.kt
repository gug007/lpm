package cx.lpm.mobile.feature.projects.ci

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ContextMenuItem
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.CiCheck
import cx.lpm.mobile.feature.projects.R

/**
 * The project menu's CI row (iOS `ProjectRunControl`): a red cross with how many fail,
 * an orange clock while running, a green check once passed. Left out while there's
 * nothing to show.
 */
@Composable
internal fun CiMenuItem(
    state: GitChecksUiState,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val checks = state.checks?.takeIf { state.available } ?: return
    val verdict = checks.verdict ?: return
    val colors = LpmTheme.colors
    val (icon, tint) = when (verdict) {
        CiCheck.State.FAIL -> DesignR.drawable.ic_cancel to colors.red
        CiCheck.State.PENDING -> DesignR.drawable.ic_schedule to colors.orange
        else -> DesignR.drawable.ic_check_circle to colors.green
    }
    ContextMenuItem(
        title = stringResource(R.string.ci_title),
        onClick = onClick,
        modifier = modifier,
        icon = painterResource(icon),
        iconTint = tint,
        subtitle = checks.label
    )
}

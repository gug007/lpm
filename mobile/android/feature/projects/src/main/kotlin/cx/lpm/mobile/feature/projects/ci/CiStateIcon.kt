package cx.lpm.mobile.feature.projects.ci

import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ActivityIndicatorSize
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.CiCheck

/** A check's state as the desktop draws it: a red cross, an orange spinner, a green check, a grey dash. */
@Composable
internal fun CiStateIcon(state: CiCheck.State, modifier: Modifier = Modifier, size: Dp = 18.dp) {
    val colors = LpmTheme.colors
    when (state) {
        CiCheck.State.PENDING ->
            ActivityIndicator(modifier, size = ActivityIndicatorSize.Mini, color = colors.orange)

        CiCheck.State.FAIL -> Icon(
            painterResource(DesignR.drawable.ic_cancel),
            contentDescription = null,
            tint = colors.red,
            modifier = modifier.size(size)
        )

        CiCheck.State.PASS -> Icon(
            painterResource(DesignR.drawable.ic_check_circle),
            contentDescription = null,
            tint = colors.green,
            modifier = modifier.size(size)
        )

        CiCheck.State.SKIPPED -> Icon(
            painterResource(DesignR.drawable.ic_do_not_disturb_on),
            contentDescription = null,
            tint = colors.secondaryLabel,
            modifier = modifier.size(size)
        )
    }
}

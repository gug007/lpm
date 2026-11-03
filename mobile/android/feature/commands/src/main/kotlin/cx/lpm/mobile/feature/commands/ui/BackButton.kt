package cx.lpm.mobile.feature.commands.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.GlassIconButton
import cx.lpm.mobile.feature.commands.R

@Composable
internal fun BackButton(onBack: () -> Unit) {
    GlassIconButton(
        icon = painterResource(DesignR.drawable.ic_arrow_back_ios_new),
        contentDescription = stringResource(R.string.back),
        onClick = onBack
    )
}

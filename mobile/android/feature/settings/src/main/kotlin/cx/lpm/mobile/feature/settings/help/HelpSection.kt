package cx.lpm.mobile.feature.settings.help

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import androidx.annotation.DrawableRes
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ListHeaderStyle
import cx.lpm.mobile.core.designsystem.component.ListSection
import cx.lpm.mobile.core.designsystem.component.NavigationRow
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.settings.R

/**
 * Settings' Help (iOS `HelpSection`): feedback to the lpm team, the video lessons,
 * what changed in lpm, and a rating, with which versions are talking at the foot.
 */
@Composable
fun HelpSection(
    macVersion: String?,
    onSendFeedback: () -> Unit,
    viewModel: HelpViewModel = hiltViewModel()
) {
    val demo by viewModel.demo.collectAsStateWithLifecycle()
    val context = LocalContext.current
    ListSection(
        header = stringResource(R.string.settings_help),
        headerStyle = ListHeaderStyle.Title,
        footer = viewModel.line(macVersion, demo)
    ) {
        NavigationRow(
            title = stringResource(R.string.settings_send_feedback),
            onClick = onSendFeedback,
            leading = { HelpIcon(DesignR.drawable.ic_mail) }
        )
        NavigationRow(
            title = stringResource(R.string.settings_video_guides),
            onClick = { context.open(LESSONS_URL) },
            leading = { HelpIcon(DesignR.drawable.ic_play_circle) }
        )
        NavigationRow(
            title = stringResource(R.string.settings_whats_new),
            onClick = { context.open(CHANGELOG_URL) },
            leading = { HelpIcon(DesignR.drawable.ic_auto_awesome) }
        )
        NavigationRow(
            title = stringResource(R.string.settings_rate),
            onClick = { context.open(PLAY_LISTING_URL) },
            leading = { HelpIcon(DesignR.drawable.ic_star) }
        )
    }
}

@Composable
private fun HelpIcon(@DrawableRes icon: Int) {
    Icon(
        painter = painterResource(icon),
        contentDescription = null,
        tint = LpmTheme.colors.tint,
        modifier = Modifier.size(26.dp)
    )
}

/** A page in the phone's browser, as iOS opens a `Link` in Safari. */
internal fun Context.open(url: String) {
    try {
        startActivity(Intent(Intent.ACTION_VIEW, url.toUri()))
    } catch (_: ActivityNotFoundException) {
        // No browser on this phone.
    }
}

private const val LESSONS_URL = "https://lpm.cx/lessons"
private const val CHANGELOG_URL = "https://lpm.cx/changelog"
private const val PLAY_LISTING_URL = "https://play.google.com/store/apps/details?id=cx.lpm.mobile"

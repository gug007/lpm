package cx.lpm.mobile.feature.commands.list

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ContextMenu
import cx.lpm.mobile.core.designsystem.component.ContextMenuItem
import cx.lpm.mobile.core.designsystem.component.GlassGroupButton
import cx.lpm.mobile.feature.commands.R

private class SkillVideo(id: String, @param:StringRes val title: Int, val length: String) {
    val url = "https://www.youtube.com/watch?v=$id"
}

private val SkillVideos = listOf(
    SkillVideo("GY0USUZz2ZM", R.string.commands_video_manage, "7:00"),
    SkillVideo("MI_GqFpr6ms", R.string.commands_video_folders, "3:38")
)

/** Video guides on the Skills bar (iOS `CommandsScreen`): the lessons, opened outside the app. */
@Composable
internal fun SkillVideosButton(modifier: Modifier = Modifier) {
    val uriHandler = LocalUriHandler.current
    var open by remember { mutableStateOf(false) }
    Box(modifier) {
        GlassGroupButton(
            icon = painterResource(DesignR.drawable.ic_smart_display_fill),
            contentDescription = stringResource(R.string.commands_video_guides),
            onClick = { open = true }
        )
        ContextMenu(expanded = open, onDismissRequest = { open = false }) {
            SkillVideos.forEach { video ->
                ContextMenuItem(
                    title = stringResource(video.title),
                    subtitle = video.length,
                    onClick = { runCatching { uriHandler.openUri(video.url) } }
                )
            }
        }
    }
}

package cx.lpm.mobile.feature.projects.newtab

import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.ui.AgentMark
import cx.lpm.mobile.core.ui.AgentMarkIcon
import cx.lpm.mobile.core.ui.providerMeta
import cx.lpm.mobile.core.ui.tint

/**
 * What leads a launchpad option (iOS `LaunchpadMark`), as the desktop's LaunchpadMark draws
 * it: its action's [emoji], so variants sharing a label stay apart, else the agent's mark.
 * A terminal ([agent] null), or an agent without a mark of its own, gets a symbol in the
 * agent's colour.
 */
@Composable
internal fun LaunchpadMark(agent: String?, emoji: String, modifier: Modifier = Modifier) {
    val mark = AgentMark.ofEmoji(emoji) ?: agent?.takeIf { emoji.isEmpty() }?.let(AgentMark::of)
    when {
        mark != null -> AgentMarkIcon(mark, modifier.size(20.dp))

        emoji.isEmpty() -> Icon(
            painter = painterResource(
                if (agent ==
                    null
                ) {
                    DesignR.drawable.ic_terminal
                } else {
                    DesignR.drawable.ic_auto_awesome_fill
                }
            ),
            contentDescription = null,
            tint = agent?.let { providerMeta(it).tint } ?: LpmTheme.colors.secondaryLabel,
            modifier = modifier.size(20.dp)
        )

        else -> Text(text = emoji, style = LpmTheme.typography.body, modifier = modifier)
    }
}

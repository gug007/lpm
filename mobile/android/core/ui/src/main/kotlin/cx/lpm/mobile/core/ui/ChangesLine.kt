package cx.lpm.mobile.core.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.GitSnapshot

/**
 * A bar title's bottom line: the lines the project's uncommitted changes add and
 * remove, across how many files; empty while the tree is clean. Faded while the Mac
 * is away, as the tree may have moved on since.
 */
@Composable
internal fun ChangesLine(git: GitSnapshot?, loading: Boolean, stale: Boolean) {
    val colors = LpmTheme.colors
    Box(Modifier.alpha(if (stale) STALE_ALPHA else 1f)) {
        when {
            git != null -> if (git.isRepo && git.files.isNotEmpty()) ChangesSummary(git)

            loading -> Box(
                Modifier
                    .size(84.dp, 7.dp)
                    .background(colors.quaternaryLabel, CircleShape)
                    .clearAndSetSemantics {}
            )
        }
    }
}

@Composable
private fun ChangesSummary(git: GitSnapshot) {
    val colors = LpmTheme.colors
    val added = git.linesAdded ?: 0
    val removed = git.linesRemoved ?: 0
    val files = git.files.size
    Row(
        horizontalArrangement = Arrangement.spacedBy(3.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (added > 0) Part("+${compactCount(added)}", colors.green)
        if (removed > 0) Part("−${compactCount(removed)}", colors.red)
        if (added + removed > 0) {
            Part("·", colors.secondaryLabel, Modifier.clearAndSetSemantics {})
        }
        Part(if (files == 1) "1 file" else "$files files", colors.secondaryLabel)
    }
}

@Composable
private fun Part(text: String, color: Color, modifier: Modifier = Modifier) {
    Text(
        text = text,
        style = barTitleLineStyle(FontWeight.Medium),
        color = color,
        maxLines = 1,
        modifier = modifier
    )
}

/** "656", "12.4k", "214k", "1.2M": a count that fits the header. */
fun compactCount(n: Int): String = when {
    n < 10_000 -> "$n"
    n < 1_000_000 -> scaledCount(n, unit = 1_000, suffix = "k")
    else -> scaledCount(n, unit = 1_000_000, suffix = "M")
}

private fun scaledCount(n: Int, unit: Int, suffix: String): String {
    val whole = (n + unit / 2) / unit
    if (whole >= 100) return "$whole$suffix"
    val tenths = (n.toLong() * 10 + unit / 2) / unit
    return if (tenths % 10 ==
        0L
    ) {
        "${tenths / 10}$suffix"
    } else {
        "${tenths / 10}.${tenths % 10}$suffix"
    }
}

private const val STALE_ALPHA = 0.5f

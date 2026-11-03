package cx.lpm.mobile.feature.commands.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import cx.lpm.mobile.core.model.CommandScope
import cx.lpm.mobile.feature.commands.R

/** "This project" or "Global", as the segments and the folder picker name a list. */
@Composable
internal fun scopeTitle(scope: CommandScope): String = stringResource(
    when (scope) {
        CommandScope.Project -> R.string.commands_this_project
        CommandScope.Global -> R.string.commands_global
    }
)

package cx.lpm.mobile.feature.git

import androidx.navigation3.runtime.EntryProviderScope
import androidx.navigation3.runtime.NavKey
import cx.lpm.mobile.core.navigation.GitAutoKey
import cx.lpm.mobile.core.navigation.GitBranchKey
import cx.lpm.mobile.core.navigation.GitCommitFileKey
import cx.lpm.mobile.core.navigation.GitCommitKey
import cx.lpm.mobile.core.navigation.GitHistoryKey
import cx.lpm.mobile.core.navigation.GitPullRequestKey
import cx.lpm.mobile.core.navigation.GitReviewKey
import cx.lpm.mobile.core.navigation.Navigator
import cx.lpm.mobile.core.navigation.SheetPresentation
import cx.lpm.mobile.feature.git.auto.GitAutoRoute
import cx.lpm.mobile.feature.git.branch.GitBranchRoute
import cx.lpm.mobile.feature.git.history.CommitDetailRoute
import cx.lpm.mobile.feature.git.history.CommitFileDiffRoute
import cx.lpm.mobile.feature.git.history.CommitHistoryRoute
import cx.lpm.mobile.feature.git.pr.GitPrRoute
import cx.lpm.mobile.feature.git.review.GitReviewRoute

/**
 * Review Changes, History with its commits and their files, and the Switch Branch, Pull
 * Request and Auto Commit sheets.
 */
fun EntryProviderScope<NavKey>.gitEntries(navigator: Navigator) {
    entry<GitReviewKey> { key ->
        GitReviewRoute(key = key, onNavigate = navigator::navigate, onBack = navigator::back)
    }
    entry<GitHistoryKey> { key ->
        CommitHistoryRoute(key = key, onNavigate = navigator::navigate, onBack = navigator::back)
    }
    entry<GitCommitKey> { key ->
        CommitDetailRoute(key = key, onNavigate = navigator::navigate, onBack = navigator::back)
    }
    entry<GitCommitFileKey> { key ->
        CommitFileDiffRoute(key = key, onBack = navigator::back)
    }
    entry<GitBranchKey>(metadata = SheetPresentation.metadata) { key ->
        GitBranchRoute(key = key, onDismiss = { navigator.dismiss(key) })
    }
    entry<GitPullRequestKey>(metadata = SheetPresentation.metadata) { key ->
        GitPrRoute(key = key, onDismiss = { navigator.dismiss(key) })
    }
    entry<GitAutoKey>(metadata = SheetPresentation.mediumMetadata) { key ->
        GitAutoRoute(key = key, onDismiss = { navigator.dismiss(key) })
    }
}

/** Close the sheet [key] once, however many of its buttons fire. */
private fun Navigator.dismiss(key: NavKey) {
    if (current == key) back()
}

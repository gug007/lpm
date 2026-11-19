package cx.lpm.mobile.feature.git.review

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.CapsuleButton
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.component.ListSection
import cx.lpm.mobile.core.designsystem.component.ProminentButton
import cx.lpm.mobile.core.designsystem.component.clickableNoIndication
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.SecretFinding
import cx.lpm.mobile.feature.git.R

/**
 * What the look for secrets found in the commit, each with a way past it (iOS
 * `SecretFindingsSection`, the desktop's SecretFindingsPanel).
 */
@Composable
internal fun SecretFindingsSection(findings: List<SecretFinding>, check: SecretCheck) {
    val colors = LpmTheme.colors
    ListSection(
        headerContent = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    painter = painterResource(DesignR.drawable.ic_warning_fill),
                    contentDescription = null,
                    tint = colors.orange,
                    modifier = Modifier.size(20.dp)
                )
                Text(
                    text = pluralStringResource(
                        R.plurals.git_secrets_title,
                        findings.size,
                        findings.size
                    ),
                    style = LpmTheme.typography.headline,
                    color = colors.orange,
                    modifier = Modifier
                        .weight(1f)
                        .padding(start = 6.dp)
                )
                Icon(
                    painter = painterResource(DesignR.drawable.ic_close),
                    contentDescription = stringResource(R.string.git_secrets_back),
                    tint = colors.tint,
                    modifier = Modifier
                        .size(22.dp)
                        .clickableNoIndication(onClick = check::dismiss)
                )
            }
        },
        footer = stringResource(R.string.git_secrets_footer)
    ) {
        findings.forEach { finding -> FindingRow(finding, check) }
    }
}

@Composable
private fun FindingRow(finding: SecretFinding, check: SecretCheck) {
    val colors = LpmTheme.colors
    val mono = LpmTheme.typography.caption1.copy(fontFamily = FontFamily.Monospace)
    ListRow {
        Column(
            Modifier.padding(vertical = 4.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Text(
                text = finding.rule,
                style = LpmTheme.typography.subheadline.copy(fontWeight = FontWeight.SemiBold),
                color = colors.label
            )
            Text(
                text = finding.place,
                style = mono,
                color = colors.secondaryLabel,
                maxLines = 2,
                overflow = TextOverflow.MiddleEllipsis
            )
            if (finding.masked.isNotEmpty()) {
                Text(
                    text = finding.masked,
                    style = mono,
                    color = colors.orange,
                    maxLines = 1,
                    overflow = TextOverflow.MiddleEllipsis
                )
            }
            Row(Modifier.padding(top = 2.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CapsuleButton(
                    text = stringResource(R.string.git_secrets_leave_out),
                    onClick = { check.leaveOut(finding.path) },
                    textStyle = LpmTheme.typography.subheadline
                )
                CapsuleButton(
                    text = stringResource(
                        if (finding.line > 0) {
                            R.string.git_secrets_ignore_line
                        } else {
                            R.string.git_secrets_ignore
                        }
                    ),
                    onClick = { check.ignore(finding) },
                    textStyle = LpmTheme.typography.subheadline
                )
            }
        }
    }
}

/**
 * The commit sheet's bottom while findings hold the commit (iOS
 * `SecretFindingsButtons`): the flagged files left out and the rest sent as asked, or
 * everything sent anyway.
 */
@Composable
internal fun SecretFindingsButtons(state: GitReviewUiState, check: SecretCheck) {
    val colors = LpmTheme.colors
    val flagged = state.flaggedFiles
    val files = pluralStringResource(R.plurals.git_secrets_files, flagged, flagged)
    Column(
        Modifier.bottomBar(),
        verticalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        if (state.cleanFiles > 0) {
            ProminentButton(
                text = stringResource(
                    if (state.pendingPushes) {
                        R.string.git_secrets_leave_out_push
                    } else {
                        R.string.git_secrets_leave_out_commit
                    },
                    files
                ),
                onClick = check::leaveOutAndCommit
            )
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .clickable(role = Role.Button, onClick = check::commitAnyway),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = stringResource(
                    if (state.pendingPushes) {
                        R.string.git_secrets_anyway_push
                    } else {
                        R.string.git_secrets_anyway
                    }
                ),
                style = LpmTheme.typography.body,
                color = colors.red
            )
        }
    }
}

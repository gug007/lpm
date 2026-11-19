package cx.lpm.mobile.core.data.client

import cx.lpm.mobile.core.protocol.Wire

// The review's extras: the look for secrets, the branch's changes, the review on
// its pull request, why a check failed, and saving an edit from the file preview.

fun LpmClient.scanSecrets(project: String, files: List<String>) =
    send(Wire.gitScanSecrets(project, files))

fun LpmClient.requestBranchFiles(project: String) = send(Wire.gitBranchFiles(project))

fun LpmClient.requestBranchDiffs(project: String, paths: List<String>) =
    send(Wire.gitBranchDiffs(project, paths))

fun LpmClient.requestPrDiscussion(project: String) = send(Wire.gitPrDiscussion(project))

fun LpmClient.requestCheckLog(project: String, url: String) = send(Wire.gitCheckLog(project, url))

fun LpmClient.writeFile(
    project: String,
    path: String,
    content: String,
    base: String,
    reqId: String
) = send(Wire.writeFile(project, path, content, base, reqId))

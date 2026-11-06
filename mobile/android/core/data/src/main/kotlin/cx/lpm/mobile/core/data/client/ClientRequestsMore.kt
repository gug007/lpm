package cx.lpm.mobile.core.data.client

import cx.lpm.mobile.core.protocol.Wire
import kotlinx.serialization.json.JsonObject

// Automations, project creation and config editing, git review, session memory and
// notes. Their replies run on Mac worker threads and can arrive out of order, so
// each echoes the keys it was addressed by.

fun LpmClient.requestJobs() = send(Wire.jobs())

fun LpmClient.requestJobHistory(project: String, jobId: String) =
    send(Wire.jobHistory(project, jobId))

fun LpmClient.requestJobLiveOutput(project: String, jobId: String) =
    send(Wire.jobLiveOutput(project, jobId))

fun LpmClient.runJob(project: String, jobId: String) = send(Wire.runJob(project, jobId))

fun LpmClient.stopJob(project: String, jobId: String) = send(Wire.stopJob(project, jobId))

fun LpmClient.takeOverJob(project: String, jobId: String) = send(Wire.takeOverJob(project, jobId))

fun LpmClient.setJobEnabled(project: String, jobId: String, enabled: Boolean) =
    send(Wire.setJobEnabled(project, jobId, enabled))

fun LpmClient.markJobSeen(project: String, jobId: String, at: Long?) =
    send(Wire.markJobSeen(project, jobId, at))

fun LpmClient.markAllJobsSeen() = send(Wire.markAllJobsSeen())

fun LpmClient.requestJobConfig(project: String, jobId: String, source: String) =
    send(Wire.jobConfig(project, jobId, source))

fun LpmClient.saveJob(id: String, source: String, project: String, job: JsonObject) =
    send(Wire.saveJob(id, source, project, job))

fun LpmClient.deleteJob(id: String, source: String, project: String, deleteCopies: Boolean) =
    send(Wire.deleteJob(id, source, project, deleteCopies))

fun LpmClient.sendJobFollowup(
    project: String,
    jobId: String,
    at: Long,
    message: String,
    agent: String,
    model: String,
    effort: String
) = send(Wire.sendJobFollowup(project, jobId, at, message, agent, model, effort))

fun LpmClient.answerJobQuestion(
    project: String,
    jobId: String,
    askId: String,
    answers: JsonObject
) = send(Wire.answerJobQuestion(project, jobId, askId, answers))

fun LpmClient.dismissJobQuestion(project: String, jobId: String, askId: String) =
    send(Wire.dismissJobQuestion(project, jobId, askId))

fun LpmClient.requestDirs(path: String) = send(Wire.listDirs(path))

fun LpmClient.requestSshHosts() = send(Wire.listSshHosts())

fun LpmClient.createProject(name: String, root: String) = send(Wire.createProject(name, root))

fun LpmClient.createSshProject(name: String, ssh: JsonObject) =
    send(Wire.createSshProject(name, ssh))

fun LpmClient.cloneProject(name: String, url: String, branch: String, destParent: String) =
    send(Wire.cloneProject(name, url, branch, destParent))

fun LpmClient.requestConfig(project: String, layer: String) = send(Wire.readConfig(project, layer))

fun LpmClient.saveConfig(project: String, layer: String, content: String) =
    send(Wire.saveConfig(project, layer, content))

fun LpmClient.requestServiceBody(project: String, key: String) =
    send(Wire.serviceBody(project, key))

fun LpmClient.requestActionBody(project: String, key: String) = send(Wire.actionBody(project, key))

fun LpmClient.saveService(project: String, key: String, payload: JsonObject, previousKey: String?) =
    send(Wire.saveService(project, key, payload, previousKey))

fun LpmClient.deleteService(project: String, key: String) = send(Wire.deleteService(project, key))

fun LpmClient.saveProfile(
    project: String,
    name: String,
    services: List<String>,
    previousName: String?
) = send(Wire.saveProfile(project, name, services, previousName))

fun LpmClient.deleteProfile(project: String, name: String) = send(Wire.deleteProfile(project, name))

fun LpmClient.saveAction(
    project: String,
    key: String,
    payload: JsonObject,
    previousKey: String?,
    section: String?
) = send(Wire.saveAction(project, key, payload, previousKey, section))

fun LpmClient.deleteAction(project: String, key: String) = send(Wire.deleteAction(project, key))

fun LpmClient.requestMemory(project: String) = send(Wire.memory(project))

fun LpmClient.requestMemorySession(project: String, name: String) =
    send(Wire.memorySession(project, name))

/**
 * Pass `baseline` to write only if the file still reads exactly like that; null
 * overwrites unconditionally (an empty baseline means "must not exist yet").
 */
fun LpmClient.saveMemorySession(project: String, name: String, content: String, baseline: String?) =
    send(Wire.memorySave(project, name, content, baseline))

fun LpmClient.deleteMemorySession(project: String, name: String) =
    send(Wire.memoryDelete(project, name))

fun LpmClient.requestNotesChats(project: String) = send(Wire.notesChats(project))

fun LpmClient.notesCreateChat(project: String, title: String) =
    send(Wire.notesCreateChat(project, title))

fun LpmClient.notesRenameChat(project: String, chatId: String, title: String) =
    send(Wire.notesRenameChat(project, chatId, title))

fun LpmClient.notesDeleteChat(project: String, chatId: String) =
    send(Wire.notesDeleteChat(project, chatId))

fun LpmClient.requestNotesMessages(project: String, chatId: String, limit: Int, beforeId: String) =
    send(Wire.notesMessages(project, chatId, limit, beforeId))

fun LpmClient.notesAddMessage(
    project: String,
    chatId: String,
    text: String,
    attachments: List<JsonObject>
) = send(Wire.notesAddMessage(project, chatId, text, attachments))

fun LpmClient.notesEditMessage(project: String, id: String, text: String) =
    send(Wire.notesEditMessage(project, id, text))

fun LpmClient.notesDeleteMessage(project: String, id: String) =
    send(Wire.notesDeleteMessage(project, id))

fun LpmClient.notesSearch(project: String, query: String, limit: Int) =
    send(Wire.notesSearch(project, query, limit))

fun LpmClient.requestNotesAttachment(project: String, hash: String) =
    send(Wire.notesAttachment(project, hash))

// Git review. push/generate/create-PR do real work on the Mac and can take a long
// while, so their stores arm generous timeouts around them.

fun LpmClient.requestGit(project: String) = send(Wire.git(project))

fun LpmClient.requestGitDiff(project: String, path: String) = send(Wire.gitDiff(project, path))

fun LpmClient.requestGitDiffs(project: String, paths: List<String>) =
    send(Wire.gitDiffs(project, paths))

fun LpmClient.gitCommit(project: String, message: String, files: List<String>) =
    send(Wire.gitCommit(project, message, files))

fun LpmClient.gitPush(project: String) = send(Wire.gitPush(project))

fun LpmClient.gitGenMessage(project: String, files: List<String>) =
    send(Wire.gitGenMessage(project, files))

fun LpmClient.gitGenPr(project: String) = send(Wire.gitGenPr(project))

fun LpmClient.gitCreatePr(project: String, title: String, body: String) =
    send(Wire.gitCreatePr(project, title, body))

fun LpmClient.gitPull(project: String) = send(Wire.gitPull(project))

fun LpmClient.gitFetch(project: String) = send(Wire.gitFetch(project))

fun LpmClient.gitAutoPullUndo(project: String) = send(Wire.gitAutoPullUndo(project))

fun LpmClient.requestGitBranches(project: String) = send(Wire.gitBranches(project))

fun LpmClient.requestGitHistory(project: String, skip: Int, limit: Int) =
    send(Wire.gitHistory(project, skip, limit))

fun LpmClient.requestGitChecks(project: String) = send(Wire.gitChecks(project))

fun LpmClient.requestGitCommitChecks(project: String) = send(Wire.gitCommitChecks(project))

fun LpmClient.requestGitChecksRerun(project: String, runIds: List<String>) =
    send(Wire.gitChecksRerun(project, runIds))

fun LpmClient.requestGitCommitFiles(project: String, hash: String) =
    send(Wire.gitCommitFiles(project, hash))

fun LpmClient.requestGitCommitPatch(project: String, hash: String, path: String, oldPath: String?) =
    send(Wire.gitCommitPatch(project, hash, path, oldPath))

fun LpmClient.gitCheckout(project: String, branch: String, remote: String) =
    send(Wire.gitCheckout(project, branch, remote))

fun LpmClient.gitCreateBranch(project: String, name: String) =
    send(Wire.gitCreateBranch(project, name))

fun LpmClient.gitDiscardAll(project: String) = send(Wire.gitDiscardAll(project))

fun LpmClient.gitDiscardFiles(project: String, paths: List<String>) =
    send(Wire.gitDiscardFiles(project, paths))

fun LpmClient.gitRestoreDiscarded(project: String, id: String) =
    send(Wire.gitRestoreDiscarded(project, id))

fun LpmClient.gitAuto(project: String, kind: String, nonce: String) =
    send(Wire.gitAuto(project, kind, nonce))

fun LpmClient.gitAutoState(project: String) = send(Wire.gitAutoState(project))

fun LpmClient.gitAutoCancel(project: String) = send(Wire.gitAutoCancel(project))

fun LpmClient.gitAutoSwitchBase(project: String, base: String) =
    send(Wire.gitAutoSwitchBase(project, base))

package cx.lpm.mobile.core.data.client

import cx.lpm.mobile.core.data.push.AgentAnswer
import cx.lpm.mobile.core.data.push.PushRegistration
import cx.lpm.mobile.core.model.AgentLaunch
import cx.lpm.mobile.core.model.AgentSession
import cx.lpm.mobile.core.model.ClaudeAccountChoice
import cx.lpm.mobile.core.model.DuplicateOptions
import cx.lpm.mobile.core.model.HistoryCursor
import cx.lpm.mobile.core.model.WorkStatusInput
import cx.lpm.mobile.core.protocol.Wire

// Requests for the projects list, terminals, the composer and the Mac itself. Reliable
// requests queue while the link is down; live traffic (`sendLive`) is dropped instead.

fun LpmClient.requestProjects() = send(Wire.projects())

fun LpmClient.requestSidebar() = send(Wire.sidebar())

fun LpmClient.requestStats(days: Int, machine: String? = null, fresh: Boolean = false) =
    send(Wire.stats(days, machine, fresh))

fun LpmClient.requestLimits() = send(Wire.limits())

fun LpmClient.requestWeeklyRecap(week: String, fresh: Boolean = false) =
    send(Wire.weeklyRecap(week, fresh))

fun LpmClient.requestSpeech(reqId: String, text: String) = send(Wire.ttsSpeak(reqId, text))

fun LpmClient.requestTerminals(project: String) = send(Wire.terminals(project))

fun LpmClient.requestSlash(id: String, project: String) = send(Wire.slash(id, project))

fun LpmClient.uploadBlob(id: String, b64: String, mime: String, name: String?, reqId: String) =
    send(Wire.upload(id, b64, mime, name, reqId))

// Each chunked-upload step is only worth sending on the link it belongs to: a
// reconnect fails the upload. The abort is queued so the Mac frees the partial file.
fun LpmClient.uploadBegin(id: String, name: String, bytes: Long, reqId: String) =
    sendLive(Wire.uploadBegin(id, name, bytes, reqId))

fun LpmClient.uploadChunk(id: String, uploadId: String, offset: Long, b64: String, reqId: String) =
    sendLive(Wire.uploadChunk(id, uploadId, offset, b64, reqId))

fun LpmClient.uploadDone(id: String, uploadId: String, reqId: String) =
    sendLive(Wire.uploadDone(id, uploadId, reqId))

fun LpmClient.uploadAbort(id: String, uploadId: String) = send(Wire.uploadAbort(id, uploadId))

fun LpmClient.requestMentions(project: String) = send(Wire.mentions(project))

fun LpmClient.requestHistory(project: String, q: String) = send(Wire.history(project, q))

fun LpmClient.recordHistory(project: String, id: String, label: String, text: String) =
    send(Wire.historyAdd(project, id, label, text))

fun LpmClient.requestStatus(project: String) = send(Wire.status(project))

fun LpmClient.clearStatus(project: String, paneId: String, value: String) =
    send(Wire.clearStatus(project, paneId, value))

fun LpmClient.archiveStatus(project: String, keys: List<String>) =
    send(Wire.archiveStatus(project, keys))

fun LpmClient.markStatusSeen(project: String, keys: List<String>) =
    send(Wire.markStatusSeen(project, keys))

fun LpmClient.markStatusUnread(project: String, keys: List<String>) =
    send(Wire.markStatusUnread(project, keys))

fun LpmClient.runAction(
    project: String,
    action: String,
    inputValues: Map<String, String> = emptyMap(),
    confirmed: Boolean = false,
    prompt: String = ""
) = send(Wire.runAction(project, action, inputValues, confirmed, prompt))

fun LpmClient.runActionBackground(
    project: String,
    action: String,
    inputValues: Map<String, String>,
    runId: String
) = send(Wire.runActionBackground(project, action, inputValues, runId))

fun LpmClient.requestActionBgOutput(project: String, runId: String) =
    send(Wire.actionBgOutput(project, runId))

fun LpmClient.cancelActionBackground(runId: String) = send(Wire.cancelActionBackground(runId))

fun LpmClient.requestBackgroundRuns(project: String) = send(Wire.backgroundRuns(project))

fun LpmClient.newTerminal(project: String, launch: AgentLaunch = AgentLaunch()) =
    send(Wire.newTerminal(project, launch))

fun LpmClient.requestAgentOptions() = send(Wire.agentOptions())

fun LpmClient.requestAgentSessions(project: String, search: String, limit: Int) =
    send(Wire.agentSessions(project, search, limit))

fun LpmClient.resumeSession(project: String, session: AgentSession) =
    send(Wire.resumeSession(project, session.provider, session.sessionId, session.title))

fun LpmClient.requestListDir(project: String, dir: String) = send(Wire.listDir(project, dir))

fun LpmClient.closeTerminal(project: String, id: String) = send(Wire.closeTerminal(project, id))

fun LpmClient.renameTerminal(project: String, id: String, label: String) =
    send(Wire.renameTerminal(project, id, label))

fun LpmClient.pinTerminal(project: String, id: String) = send(Wire.pinTerminal(project, id))

fun LpmClient.restartTerminal(project: String, id: String) = send(Wire.restartTerminal(project, id))

fun LpmClient.forkTerminal(project: String, id: String) = send(Wire.forkTerminal(project, id))

fun LpmClient.forkTerminalCopy(project: String, id: String) =
    send(Wire.forkTerminalCopy(project, id))

fun LpmClient.titleTerminal(project: String, id: String) = send(Wire.titleTerminal(project, id))

fun LpmClient.closeOtherTerminals(project: String, id: String) =
    send(Wire.closeOtherTerminals(project, id))

fun LpmClient.reorderTerminals(project: String, order: List<String>) =
    send(Wire.reorderTerminals(project, order))

fun LpmClient.duplicateProject(name: String, options: DuplicateOptions) =
    send(Wire.duplicate(name, options))

fun LpmClient.requestDuplicateDefaults() = send(Wire.duplicateDefaults())

fun LpmClient.removeProject(name: String) = send(Wire.remove(name))

fun LpmClient.renameProject(project: String, name: String) = send(Wire.renameProject(project, name))

/** Set a duplicate's work status; a null `status` clears it. */
fun LpmClient.setWorkStatus(project: String, status: WorkStatusInput?) =
    send(Wire.setWorkStatus(project, status))

/** Set a project's own auto pull choice; a null `value` follows the default. */
fun LpmClient.setAutoPull(project: String, value: Boolean?) = send(Wire.setAutoPull(project, value))

fun LpmClient.requestClaudeAccounts() = send(Wire.claudeAccounts())

/** Set a project's Claude account, first confirming `confirm` as the person's own. */
fun LpmClient.setClaudeAccount(
    project: String,
    choice: ClaudeAccountChoice,
    confirm: List<String>
) = send(Wire.setClaudeAccount(project, choice, confirm))

fun LpmClient.sidebarCreateFolder(name: String) = send(Wire.sidebarCreateFolder(name))

fun LpmClient.sidebarRenameFolder(name: String, newName: String) =
    send(Wire.sidebarRenameFolder(name, newName))

fun LpmClient.sidebarDeleteFolder(name: String) = send(Wire.sidebarDeleteFolder(name))

fun LpmClient.sidebarMoveProject(project: String, folder: String?) =
    send(Wire.sidebarMoveProject(project, folder))

fun LpmClient.fileChunk(reqId: String, project: String, path: String, offset: Long, length: Long) =
    send(Wire.fileChunk(reqId, project, path, offset, length))

/** Register (or refresh) this phone's push identity with the Mac. */
fun LpmClient.sendPushToken(p: PushRegistration) = send(
    Wire.pushToken(
        platform = p.platform,
        token = p.token,
        env = null,
        key = p.key,
        notifyWaiting = p.waiting,
        notifyDone = p.done,
        notifyError = p.error,
        notifyAutomationStarted = p.automationStarted,
        notifyAutomationDone = p.automationDone,
        notifyAutomationError = p.automationError,
        notifyWeeklyRecap = p.weeklyRecap
    )
)

fun LpmClient.sendLiveActivity(on: Boolean) = send(Wire.liveActivity(on))

/** A notification's answer; live only, so a dead link times out rather than resending it. */
fun LpmClient.answerAgent(a: AgentAnswer, reqId: String) = sendLive(
    Wire.answerAgent(a.project, a.terminalId, a.key, a.ts, a.action.wire, a.text, reqId)
)

fun LpmClient.startProject(name: String, profile: String = "") = send(Wire.start(name, profile))

fun LpmClient.stopProject(name: String) = send(Wire.stop(name))

fun LpmClient.toggleService(name: String, service: String) = send(Wire.toggleService(name, service))

fun LpmClient.requestMachines() = send(Wire.machines())

fun LpmClient.requestMachinePair(slug: String) = send(Wire.machinePair(slug))

fun LpmClient.updateCheck(force: Boolean = false) = send(Wire.updateCheck(force))

fun LpmClient.updateInstall() = send(Wire.updateInstall())

fun LpmClient.updateCancel() = send(Wire.updateCancel())

fun LpmClient.claim(id: String) = send(Wire.claim(id))

fun LpmClient.sendInput(id: String, data: String) = sendLive(Wire.input(id, data))

fun LpmClient.resize(id: String, cols: Int, rows: Int) = sendLive(Wire.resize(id, cols, rows))

// Composer parity.

fun LpmClient.requestComposerActions() = send(Wire.composerActions())

// Keystroke-frequency, so fire-and-forget: the seed reconciles the draft after a
// reconnect, and a dropped frame is superseded by the next edit.
fun LpmClient.sendComposerDraft(id: String, text: String) = sendLive(Wire.composerDraft(id, text))

fun LpmClient.runTransform(
    reqId: String,
    project: String,
    instruction: String,
    text: String,
    variants: Int
) = send(Wire.transform(reqId, project, instruction, text, variants))

fun LpmClient.requestServices(project: String) = send(Wire.services(project))

fun LpmClient.requestServiceLogs(project: String, paneIndex: Int, lines: Int) =
    send(Wire.serviceLogs(project, paneIndex, lines))

/** Live like a terminal `sub`: the Mac forgets watches, and the sheet re-watches on ready. */
fun LpmClient.setServiceLogsWatch(project: String, paneIndex: Int, watch: Boolean) =
    sendLive(Wire.serviceLogsWatch(project, paneIndex, watch))

fun LpmClient.requestHistoryQuery(
    project: String?,
    search: String?,
    favoritesOnly: Boolean,
    folder: String?,
    before: HistoryCursor?
) = send(Wire.historyQuery(project, search, favoritesOnly, folder, before))

fun LpmClient.historySaveDraft(
    message: String,
    project: String?,
    id: String?,
    label: String?,
    images: Map<String, String>?
) = send(Wire.historySaveDraft(message, project, id, label, images))

fun LpmClient.historyToggleFavorite(id: String) = send(Wire.historyToggleFavorite(id))

fun LpmClient.historySetFolder(id: String, folder: String?) =
    send(Wire.historySetFolder(id, folder))

fun LpmClient.historyDelete(id: String) = send(Wire.historyDelete(id))

fun LpmClient.requestHistoryFolders() = send(Wire.historyFolders())

fun LpmClient.historyCreateFolder(name: String) = send(Wire.historyCreateFolder(name))

fun LpmClient.historyDeleteFolder(id: String?, name: String?) =
    send(Wire.historyDeleteFolder(id, name))

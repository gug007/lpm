package cx.lpm.mobile.core.data.client

import cx.lpm.mobile.core.model.GitDiffResult
import cx.lpm.mobile.core.protocol.Inbound

/**
 * Hands a reply or push to its callback. The frames that drive the connection
 * itself (pairing, `ready`, `bye`, `error`, terminal streams, `pong`) are handled
 * by [LpmClient] before this runs.
 */
internal fun LpmClientCallbacks.route(frame: Inbound) {
    when (frame) {
        is Inbound.Projects -> {
            onProjects?.invoke(frame.projects)
            onWorkStatusPalette?.invoke(frame.workStatuses, frame.workStatusOrder)
            onAutoPullMode?.invoke(frame.autoPullMode)
            onSeenAgentsShown?.invoke(frame.seenAgentsShown)
            onKeepFinishedAgents?.invoke(frame.keepFinishedAgents)
        }

        is Inbound.Sidebar -> onSidebar?.invoke(frame.order, frame.groups)

        is Inbound.Stats -> onStats?.invoke(frame.stats, frame.error)

        is Inbound.Limits -> onLimits?.invoke(frame.snapshot, frame.error)

        is Inbound.WeeklyRecap ->
            onWeeklyRecap?.invoke(frame.week, frame.period, frame.recap, frame.error)

        is Inbound.LimitsChanged -> onLimitsChanged?.invoke(frame.snapshot)

        is Inbound.LimitReminders -> onLimitReminders?.invoke(frame.reminders, frame.error)

        is Inbound.Wake -> onWake?.invoke(frame.ok)

        is Inbound.TtsSpeak -> onSpeech?.invoke(frame.reqId, frame.audio, frame.error)

        is Inbound.Terminals -> onTerminals?.invoke(frame.project, frame.terminals)

        is Inbound.Slash -> onSlash?.invoke(frame.id, frame.commands)

        is Inbound.Upload -> onUpload?.invoke(frame.id, frame.reqId, frame.path)

        is Inbound.UploadStep -> onUploadStep?.invoke(frame.step)

        is Inbound.Mentions -> onMentions?.invoke(frame.project, frame.entries)

        is Inbound.History -> onHistory?.invoke(frame.project, frame.rows)

        is Inbound.Status -> onStatus?.invoke(frame.project, frame.entries, frame.seen)

        is Inbound.Jobs -> onJobs?.invoke(frame.jobs, frame.machines, frame.error)

        is Inbound.JobHistory ->
            onJobHistory?.invoke(frame.project, frame.jobId, frame.entries, frame.error)

        is Inbound.JobLiveOutput ->
            onJobLiveOutput?.invoke(frame.project, frame.jobId, frame.live, frame.error)

        is Inbound.AutomationMutation ->
            onAutomationMutation?.invoke(frame.project, frame.jobId, frame.error)

        is Inbound.AutomationFollowup ->
            onAutomationFollowup?.invoke(frame.project, frame.jobId, frame.error)

        is Inbound.AutomationAnswer ->
            onAutomationAnswer?.invoke(frame.project, frame.jobId, frame.error)

        is Inbound.JobConfig -> onJobConfig?.invoke(
            frame.project,
            frame.jobId,
            frame.job,
            frame.error
        )

        is Inbound.JobSaved -> onJobSaved?.invoke(frame.id, frame.error)

        is Inbound.JobDeleted -> onJobDeleted?.invoke(frame.id, frame.error)

        Inbound.JobsChanged -> onJobsChanged?.invoke()

        is Inbound.Control -> onControl?.invoke(frame.id, frame.owner)

        // A duplicate reply lands only after the desktop finished the clone and
        // rewrote its config, so a re-request is guaranteed to reflect it.
        is Inbound.DuplicateDefaults ->
            onDuplicateDefaults?.invoke(
                frame.excludeUncommitted,
                frame.reinstallDeps,
                frame.pullLatest
            )

        is Inbound.DuplicateProgress -> onDuplicateProgress?.invoke(
            frame.done,
            frame.total,
            frame.name
        )

        is Inbound.Duplicate -> onDuplicateDone?.invoke(frame.error, frame.warning)

        is Inbound.Remove -> {
            val error = frame.error
            if (error != null) onActionError?.invoke(error) else onProjectsChanged?.invoke()
        }

        is Inbound.ServiceOp -> {
            val error = frame.error
            if (error != null) onActionError?.invoke(error) else onProjectsChanged?.invoke()
        }

        is Inbound.RenameProject -> onRenameProject?.invoke(frame.project, frame.error)

        is Inbound.SetWorkStatus -> onSetWorkStatus?.invoke(frame.project, frame.error)

        is Inbound.SetAutoPull -> onSetAutoPull?.invoke(frame.project, frame.error)

        is Inbound.ClaudeAccounts -> onClaudeAccounts?.invoke(frame.accounts)

        is Inbound.SetClaudeAccount -> onSetClaudeAccount?.invoke(frame.project, frame.error)

        is Inbound.SidebarMutation -> onSidebarMutation?.invoke(
            frame.order,
            frame.groups,
            frame.error
        )

        is Inbound.FileChunk -> onFileChunk?.invoke(frame.chunk)

        is Inbound.ActionFailed -> onActionFailed?.invoke(frame.project, frame.error)

        is Inbound.AgentOptions -> onAgentOptions?.invoke(frame.agents)

        is Inbound.AgentSessions -> onAgentSessions?.invoke(frame.page)

        is Inbound.ListDir -> onListDir?.invoke(frame.contents)

        Inbound.ProjectsChanged -> onProjectsChanged?.invoke()

        is Inbound.StatusChanged -> onStatusChanged?.invoke(frame.project)

        else -> routeGitAndMore(frame)
    }
}

private fun LpmClientCallbacks.routeGitAndMore(frame: Inbound) {
    when (frame) {
        is Inbound.Git -> onGit?.invoke(frame.project, frame.snapshot, frame.error)

        is Inbound.GitDiff -> {
            val result = if (frame.error == null) {
                GitDiffResult(frame.diff, frame.binary, frame.truncated)
            } else {
                null
            }
            onGitDiff?.invoke(frame.project, frame.path, result, frame.error)
        }

        is Inbound.GitDiffs -> onGitDiffs?.invoke(frame.project, frame.entries, frame.error)

        is Inbound.GitCommit -> onGitCommit?.invoke(frame.project, frame.error)

        is Inbound.GitPush -> onGitPush?.invoke(frame.project, frame.error)

        is Inbound.GitGenMessage -> onGitGenMessage?.invoke(
            frame.project,
            frame.message,
            frame.error
        )

        is Inbound.GitGenPr -> onGitGenPr?.invoke(
            frame.project,
            frame.title,
            frame.body,
            frame.error
        )

        is Inbound.GitCreatePr -> onGitCreatePr?.invoke(frame.project, frame.url, frame.error)

        is Inbound.GitPull -> onGitPull?.invoke(frame.project, frame.error)

        is Inbound.GitFetch -> onGitFetch?.invoke(frame.project, frame.error)

        is Inbound.GitAutoPullUndo -> onGitAutoPullUndo?.invoke(frame.project, frame.error)

        is Inbound.GitBranches ->
            onGitBranches?.invoke(frame.project, frame.current, frame.branches, frame.error)

        is Inbound.GitCheckout -> onGitCheckout?.invoke(frame.project, frame.error)

        is Inbound.GitCreateBranch -> onGitCreateBranch?.invoke(frame.project, frame.error)

        is Inbound.GitDiscardAll -> onGitDiscardAll?.invoke(frame.project, frame.error)

        is Inbound.GitChanged -> onGitChanged?.invoke(frame.project)

        is Inbound.GitAuto -> onGitAuto?.invoke(frame.project, frame.run, frame.error)

        is Inbound.GitAutoSwitchBase ->
            onGitAutoSwitchBase?.invoke(frame.project, frame.base, frame.error, frame.pullError)

        is Inbound.UpdateCheck -> onUpdateCheck?.invoke(frame.check)

        is Inbound.UpdateProgress -> onUpdateProgress?.invoke(frame.step)

        is Inbound.UpdateInstall -> onUpdateInstall?.invoke(frame.cancelled, frame.error)

        is Inbound.UpdateCancel -> onUpdateCancel?.invoke(frame.stopping)

        is Inbound.ApnsToken -> onApnsToken?.invoke(frame.ok)

        is Inbound.PushToken -> onPushToken?.invoke(frame.ok)

        is Inbound.AnswerAgent -> onAnswerAgent?.invoke(frame.reqId, frame.error)

        is Inbound.LiveActivity -> onLiveActivity?.invoke(frame.ok)

        is Inbound.ComposerActions -> onComposerActions?.invoke(frame.actions)

        is Inbound.TransformVariant ->
            onTransformVariant?.invoke(frame.reqId, frame.idx, frame.text, frame.error)

        is Inbound.TransformDone -> onTransformDone?.invoke(frame.reqId, frame.ok)

        is Inbound.ComposerDraft ->
            onComposerDraft?.invoke(frame.id, frame.text, frame.rev, frame.origin, false)

        is Inbound.Services ->
            onServices?.invoke(frame.project, frame.running, frame.services, frame.error)

        is Inbound.ServiceLogs ->
            onServiceLogs?.invoke(frame.project, frame.paneIndex, frame.text, frame.error)

        is Inbound.ActionBgOutput -> onActionBgOutput?.invoke(frame.runId, frame.snapshot)

        is Inbound.ActionBgStartFailed -> onActionBgStartFailed?.invoke(frame.runId, frame.error)

        is Inbound.BackgroundRuns -> onBackgroundRuns?.invoke(frame.project, frame.runs)

        is Inbound.HistoryQuery -> onHistoryQuery?.invoke(frame.items, frame.hasMore)

        is Inbound.HistorySaveDraft -> onHistorySaveDraft?.invoke(frame.ok)

        is Inbound.HistoryToggleFavorite ->
            onHistoryToggleFavorite?.invoke(frame.id, frame.favorite, frame.error)

        is Inbound.HistoryMutated -> onHistoryMutated?.invoke(frame.ok, frame.error)

        is Inbound.HistoryFolders -> onHistoryFolders?.invoke(frame.folders)

        is Inbound.HistoryCreateFolder -> onHistoryCreateFolder?.invoke(frame.folder, frame.error)

        is Inbound.ListDirs -> onListDirs?.invoke(frame.listing, frame.error)

        is Inbound.ListSshHosts -> onListSshHosts?.invoke(frame.hosts, frame.error)

        is Inbound.Machines -> onMachines?.invoke(frame.machines)

        is Inbound.MachinePair -> onMachinePair?.invoke(frame.slug, frame.offer, frame.error)

        is Inbound.CreateProject -> onCreateProject?.invoke(frame.name, frame.error)

        is Inbound.CreateSshProject -> onCreateSshProject?.invoke(frame.name, frame.error)

        is Inbound.CloneProject -> onCloneProject?.invoke(frame.name, frame.error)

        else -> routeConfigAndNotes(frame)
    }
}

private fun LpmClientCallbacks.routeConfigAndNotes(frame: Inbound) {
    when (frame) {
        is Inbound.ReadConfig ->
            onReadConfig?.invoke(
                frame.project,
                frame.layer,
                frame.content,
                frame.available,
                frame.error
            )

        is Inbound.SaveConfig -> onSaveConfig?.invoke(
            frame.project,
            frame.layer,
            frame.name,
            frame.error
        )

        is Inbound.ServiceBody ->
            onServiceBody?.invoke(frame.project, frame.key, frame.body, frame.source, frame.error)

        is Inbound.ActionBody -> onActionBody?.invoke(
            frame.project,
            frame.key,
            frame.body,
            frame.section,
            frame.source,
            frame.error
        )

        is Inbound.SaveService -> onSaveService?.invoke(frame.project, frame.key, frame.error)

        is Inbound.DeleteService -> onDeleteService?.invoke(frame.project, frame.key, frame.error)

        is Inbound.SaveProfile -> onSaveProfile?.invoke(frame.project, frame.name, frame.error)

        is Inbound.DeleteProfile -> onDeleteProfile?.invoke(frame.project, frame.name, frame.error)

        is Inbound.SaveAction -> onSaveAction?.invoke(frame.project, frame.key, frame.error)

        is Inbound.DeleteAction -> onDeleteAction?.invoke(frame.project, frame.key, frame.error)

        is Inbound.Memory -> onMemory?.invoke(frame.project, frame.list, frame.error)

        is Inbound.MemorySession ->
            onMemorySession?.invoke(frame.project, frame.name, frame.session, frame.error)

        is Inbound.MemorySave -> onMemorySave?.invoke(frame.project, frame.name, frame.error)

        is Inbound.MemoryDelete -> onMemoryDelete?.invoke(frame.project, frame.name, frame.error)

        is Inbound.MemoryChanged -> onMemoryChanged?.invoke(frame.project)

        is Inbound.NotesChats -> onNotesChats?.invoke(frame.project, frame.chats, frame.error)

        is Inbound.NotesCreateChat -> onNotesCreateChat?.invoke(
            frame.project,
            frame.chat,
            frame.error
        )

        is Inbound.NotesRenameChat ->
            onNotesRenameChat?.invoke(frame.project, frame.chatId, frame.error)

        is Inbound.NotesDeleteChat ->
            onNotesDeleteChat?.invoke(frame.project, frame.chatId, frame.error)

        is Inbound.NotesMessages -> onNotesMessages?.invoke(
            frame.project,
            frame.chatId,
            frame.beforeId,
            frame.messages,
            frame.error
        )

        is Inbound.NotesAddMessage ->
            onNotesAddMessage?.invoke(frame.project, frame.chatId, frame.message, frame.error)

        is Inbound.NotesEditMessage -> onNotesEditMessage?.invoke(
            frame.project,
            frame.id,
            frame.error
        )

        is Inbound.NotesDeleteMessage ->
            onNotesDeleteMessage?.invoke(frame.project, frame.id, frame.error)

        is Inbound.NotesSearch ->
            onNotesSearch?.invoke(frame.project, frame.query, frame.hits, frame.error)

        is Inbound.NotesAttachment ->
            onNotesAttachment?.invoke(frame.project, frame.hash, frame.data, frame.error)

        // The connection frames, which LpmClient handled before routing.
        else -> Unit
    }
}

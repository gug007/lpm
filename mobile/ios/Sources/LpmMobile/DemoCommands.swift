import Foundation

extension DemoWorld {
    struct Command {
        var name: String
        var folder: String?
        var description: String
        var body: String
        var keptOutOfGit = false
        var tracked = true
        /// How often it ran, and when last: `lastRunAt` once it runs here, else
        /// `ranAgo` ms before the moment the list is read.
        var runs = 0
        var lastRunAt: Int? = nil
        var ranAgo: Int? = nil
    }

    struct Other {
        var name: String
        var description: String
        var preview: String
        var agents: [String]
        var path: String
        var folder: String? = nil
        var atRoot = false
    }

    struct CommandList {
        var folders: [String]
        var commands: [Command]
        var others: [Other]

        init(_ commands: [Command], others: [Other] = []) {
            self.commands = commands
            self.others = others
            folders = []
            for c in commands {
                if let f = c.folder, !folders.contains(f) { folders.append(f) }
            }
        }
    }

    // The desktop's sample (lpm-commands.ts): a few everyday prompts for every
    // project, and a couple each project keeps in its own folder.
    static let globalCommandsSeed = CommandList([
        Command(name: "commit-parts", folder: "Git", description: "Small conventional commits, no push",
                body: "Split my changes into small conventional commits, one concern per commit. Do not push.",
                runs: 23, ranAgo: 2 * 3_600_000),
        Command(name: "write-tests", folder: "Testing", description: "Tests for what I just changed",
                body: "Write focused tests for the code I just changed, run them, and fix anything that fails.",
                runs: 2, ranAgo: 9 * 86_400_000),
        Command(name: "explain", folder: nil, description: "Explain a piece of code",
                body: "Explain what $ARGUMENTS does, where it is called from, and what would break if it changed."),
    ], others: globalOthersSeed)

    /// The desktop's sample of skills not made in lpm, by list. `{root}` is the project.
    static let globalOthersSeed = [
        Other(name: "find-docs", description: "Look up current docs for a library",
              preview: "Find the official docs for the library in question and quote the relevant section.",
              agents: ["claude", "codex", "gemini", "opencode"],
              path: "/Users/demo/.agents/skills/find-docs/SKILL.md"),
        Other(name: "playwright-cli", description: "Drive a browser to test a page",
              preview: "Open the page in a browser, follow the steps and report what you see.",
              agents: ["claude", "opencode"], path: "/Users/demo/.claude/skills/playwright-cli/SKILL.md"),
        Other(name: "testflight-upload", description: "Upload a build to TestFlight",
              preview: "Archive the app, upload it to TestFlight and report the build number.",
              agents: ["codex"], path: "/Users/demo/.codex/skills/testflight-upload/SKILL.md"),
    ]

    static let projectOthersSeed = [
        Other(name: "db-migrate", description: "Write and run a database migration",
              preview: "Write a migration for the change, run it locally and show the schema diff.",
              agents: ["codex", "gemini", "opencode"], path: "{root}/.agents/skills/db-migrate/SKILL.md"),
        Other(name: "deploy-preview", description: "Deploy the current branch to a preview URL",
              preview: "Build the app, deploy it to a preview URL and post the link.",
              agents: ["claude", "opencode"], path: "{root}/.claude/skills/deploy-preview/SKILL.md"),
    ]

    static let projectCommandsSeed = CommandList([
        Command(name: "review-changes", folder: "Review", description: "Bugs and gaps in my uncommitted changes",
                body: "Review my uncommitted changes for bugs, missing edge cases and untested paths. List blocking issues first.",
                runs: 11, ranAgo: 40 * 60_000),
        Command(name: "fix-ticket", folder: "Bugs", description: "Fix a ticket on the current branch",
                body: "Fix {{ticket}} on branch {{branch}}. Read the issue first and tell me your plan before editing. Keep the diff small and add a test.",
                runs: 4, ranAgo: 3 * 86_400_000),
    ], others: projectOthersSeed)
}

struct DemoCommandError: Error {
    let message: String
    init(_ message: String) { self.message = message }
}

/// Demo handlers for lpm commands, by the rules the Mac keeps (lpm_commands.rs):
/// one name per list whatever its case, folders that stay when emptied, folders
/// that are paths and take what's inside them along, a deleted folder's contents
/// moved up a level, and a project's own command ahead of a
/// global one of the same name.
extension DemoServer {
    private static let commandVerbs = ["lpmCommands", "lpmCommandSave", "lpmCommandDelete",
                                       "lpmCommandFolder", "lpmCommandExpand", "lpmCommandOtherFolder", "lpmCommandConvert"]
    private static let autoVariables = ["branch", "project", "dir"]

    func registerCommandsHandlers() {
        for verb in Self.commandVerbs {
            register(verb) { [weak self] o in self?.answerCommands(verb, o) }
        }
    }

    /// The `/` menu's lpm rows for a project's terminal: this project's commands,
    /// then the global ones whose name it doesn't already use.
    func demoCommandSlashRows(_ project: String) -> [[String: Any]] {
        effectiveCommands(project).map { c, scope in
            ["name": c.name, "description": c.description, "argumentHint": Self.argumentHint(c.body),
             "source": "lpm", "folder": c.folder ?? NSNull(), "scope": scope]
        }
    }

    private func answerCommands(_ verb: String, _ o: [String: Any]) {
        let project = o["project"] as? String ?? ""
        // A run counts against its skill's list, so the change it pushes names that list.
        let ranScope = verb == "lpmCommandExpand" ? effectiveCommand(project, o["name"] as? String ?? "")?.1 : nil
        var reply: [String: Any]
        do {
            reply = try commandsReply(verb, project, o)
            reply["ok"] = true
        } catch {
            reply = ["ok": false, "error": (error as? DemoCommandError)?.message ?? "\(error)"]
        }
        reply["t"] = verb
        reply["project"] = project
        if let reqId = o["reqId"] { reply["reqId"] = reqId }
        pushAfter(0.2, reply)
        guard reply["ok"] as? Bool == true, verb != "lpmCommands" else { return }
        let global = verb == "lpmCommandExpand" ? ranScope == "global" : Self.touchesGlobal(o)
        pushAfter(0.2, ["t": "lpmCommandsChanged", "project": global ? "" : project])
    }

    /// Like the Mac, a change that reaches the global list (by its scope, a save's
    /// previous place or a delete's target) pushes no project: every project's
    /// lists hold the global one.
    private static func touchesGlobal(_ o: [String: Any]) -> Bool {
        let places: [Any?] = [o, o["command"], o["previous"], o["target"]]
        return places.contains { ($0 as? [String: Any])?["scope"] as? String == "global" }
    }

    private func commandsReply(_ verb: String, _ project: String, _ o: [String: Any]) throws -> [String: Any] {
        switch verb {
        case "lpmCommands":
            break
        case "lpmCommandExpand":
            let (text, missing) = try expandCommand(project, name: o["name"] as? String ?? "",
                                                    args: o["args"] as? String ?? "")
            return ["text": text, "missing": missing]
        case "lpmCommandSave":
            try saveCommand(project, o["command"] as? [String: Any] ?? [:], previous: o["previous"] as? [String: Any])
        case "lpmCommandOtherFolder":
            try moveOther(project, o)
        case "lpmCommandConvert":
            try convertSkill(project, o)
        case "lpmCommandDelete":
            let target = o["target"] as? [String: Any] ?? [:]
            let folder = target["folder"] as? String
            let name = target["name"] as? String ?? ""
            try updateCommands(project, Self.scope(target)) { list in
                list.commands.removeAll { $0.folder == folder && $0.name == name }
            }
        default:
            try changeFolder(project, o)
        }
        return ["lists": commandLists(project)]
    }

    // MARK: lists

    private func hasOwnCommands(_ project: String) -> Bool {
        world.projects.contains { $0.name == project }
    }

    private func ownCommands(_ project: String) -> DemoWorld.CommandList? {
        hasOwnCommands(project) ? world.commandsByProject[project] ?? DemoWorld.projectCommandsSeed : nil
    }

    private func commands(_ project: String, _ scope: String) throws -> DemoWorld.CommandList {
        if scope == "global" { return world.commandsGlobal }
        guard let own = ownCommands(project) else { throw DemoCommandError("This terminal isn't in a project.") }
        return own
    }

    func updateCommands(_ project: String, _ scope: String,
                                _ change: (inout DemoWorld.CommandList) throws -> Void) throws {
        var list = try commands(project, scope)
        try change(&list)
        if scope == "global" { world.commandsGlobal = list } else { world.commandsByProject[project] = list }
    }

    private func commandLists(_ project: String) -> [String: Any] {
        ["global": Self.wire(world.commandsGlobal, scope: "global", project: project),
         "project": ownCommands(project).map { Self.wire($0, scope: "project", project: project) } ?? NSNull(),
         "projectError": NSNull()]
    }

    private func effectiveCommands(_ project: String) -> [(DemoWorld.Command, String)] {
        let own = ownCommands(project).map { Self.sorted($0.commands).map { ($0, "project") } } ?? []
        let global = Self.sorted(world.commandsGlobal.commands).map { ($0, "global") }
        var seen = Set<String>()
        return (own + global).filter { seen.insert($0.0.name.lowercased()).inserted }
    }

    private func effectiveCommand(_ project: String, _ name: String) -> (DemoWorld.Command, String)? {
        let key = String(name.drop(while: { $0 == "/" })).lowercased()
        return effectiveCommands(project).first { $0.0.name.lowercased() == key }
    }

    private static func skillsDir(_ scope: String, _ project: String) -> String {
        scope == "project" ? "/Users/demo/dev/\(project)/.agents/skills" : "/Users/demo/.agents/skills"
    }

    private static func wire(_ list: DemoWorld.CommandList, scope: String, project: String) -> [String: Any] {
        ["folders": list.folders.sorted { folderOrder($0) < folderOrder($1) },
         "inRepo": scope == "project",
         "others": list.others.sorted { byName($0.name, $1.name) }.map { o -> [String: Any] in
             var row: [String: Any] = [
                 "name": o.name, "description": o.description, "preview": o.preview, "agents": o.agents,
                 "path": o.path.replacingOccurrences(of: "{root}", with: "/Users/demo/dev/\(project)"),
                 "folder": o.folder ?? NSNull()]
             if o.atRoot { row["atRoot"] = true }
             return row
         },
         "commands": sorted(list.commands).map { c -> [String: Any] in
             var row: [String: Any] = [
                 "name": c.name, "folder": c.folder ?? NSNull(), "description": c.description, "body": c.body,
                 "scope": scope, "argumentHint": argumentHint(c.body), "keptOutOfGit": c.keptOutOfGit,
                 "tracked": scope == "project" && c.tracked,
                 "path": "\(skillsDir(scope, project))/\(c.name)/SKILL.md"]
             if c.runs > 0 {
                 row["runs"] = c.runs
                 row["lastRunAt"] = c.lastRunAt ?? Int(Date().timeIntervalSince1970 * 1000) - (c.ranAgo ?? 0)
             }
             return row
         }]
    }

    private static func byName(_ a: String, _ b: String) -> Bool { a.lowercased() < b.lowercased() }

    /// By folder, No folder last, then by name.
    private static func sorted(_ commands: [DemoWorld.Command]) -> [DemoWorld.Command] {
        commands.sorted { a, b in
            switch (a.folder, b.folder) {
            case let (fa?, fb?) where fa != fb: return folderOrder(fa) < folderOrder(fb)
            case (nil, _?): return false
            case (_?, nil): return true
            default: return byName(a.name, b.name)
            }
        }
    }

    static func scope(_ o: [String: Any]) -> String {
        o["scope"] as? String == "global" ? "global" : "project"
    }

    static func placeLabel(_ folder: String?) -> String {
        folder.map { "the \($0) folder" } ?? "No folder"
    }

    // MARK: changes

    private func saveCommand(_ project: String, _ input: [String: Any], previous: [String: Any]?) throws {
        let name = input["name"] as? String ?? ""
        guard name.range(of: "^(?=.{1,64}$)[a-z0-9]+(-[a-z0-9]+)*$", options: .regularExpression) != nil else {
            throw DemoCommandError("Use lowercase letters, numbers and single hyphens for the name.")
        }
        let body = (input["body"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { throw DemoCommandError("Write the prompt first.") }
        let scope = Self.scope(input)
        let folder = try Self.cleanFolder(input["folder"] as? String)
        let prev = previous.map { (scope: Self.scope($0), folder: $0["folder"] as? String, name: $0["name"] as? String ?? "") }
        let isPrevious = { (c: DemoWorld.Command) in
            prev.map { $0.scope == scope && $0.folder == c.folder && $0.name == c.name } ?? false
        }
        if let clash = try commands(project, scope).commands.first(where: {
            $0.name.lowercased() == name.lowercased() && !isPrevious($0)
        }) {
            throw DemoCommandError("/\(clash.name) already exists in \(Self.placeLabel(clash.folder)).")
        }
        let before = prev.flatMap { p in
            try? commands(project, p.scope).commands.first { $0.folder == p.folder && $0.name == p.name }
        }
        let stays = prev?.scope == scope
        let keptOut = scope == "project"
            && (input["keepOutOfGit"] as? Bool ?? (stays && before?.keptOutOfGit == true))
        if let prev {
            try updateCommands(project, prev.scope) { list in
                list.commands.removeAll { $0.folder == prev.folder && $0.name == prev.name }
            }
        }
        try updateCommands(project, scope) { list in
            let place = folder.map { Self.addFolder(&list.folders, $0) }
            let description = (input["description"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            list.commands.append(DemoWorld.Command(name: name, folder: place, description: description, body: body,
                                                   keptOutOfGit: keptOut,
                                                   tracked: !keptOut && stays && before?.tracked == true,
                                                   runs: before?.runs ?? 0, lastRunAt: before?.lastRunAt,
                                                   ranAgo: before?.ranAgo))
        }
    }

    private func moveOther(_ project: String, _ o: [String: Any]) throws {
        let name = o["name"] as? String ?? ""
        let folder = try Self.cleanFolder(o["folder"] as? String)
        try updateCommands(project, Self.scope(o)) { list in
            guard let i = list.others.firstIndex(where: { $0.name == name }) else {
                throw DemoCommandError("/\(name) isn't in this list any more.")
            }
            let kept = folder.map { Self.addFolder(&list.folders, $0) }
            list.others[i].folder = kept
            list.others[i].atRoot = kept == nil && o["root"] as? Bool == true
        }
    }

    private func convertSkill(_ project: String, _ o: [String: Any]) throws {
        let name = o["name"] as? String ?? ""
        let scope = Self.scope(o)
        let root = scope == "global" ? "/Users/demo" : "{root}"
        try updateCommands(project, scope) { list in
            if o["toLpm"] as? Bool == true {
                guard let i = list.others.firstIndex(where: { $0.name == name }) else {
                    throw DemoCommandError("/\(name) isn't in this list any more.")
                }
                let other = list.others.remove(at: i)
                list.commands.append(DemoWorld.Command(name: other.name, folder: other.folder,
                                                       description: other.description, body: other.preview))
            } else {
                guard let i = list.commands.firstIndex(where: { $0.name == name }) else {
                    throw DemoCommandError("/\(name) isn't in this list any more.")
                }
                let c = list.commands.remove(at: i)
                list.others.append(DemoWorld.Other(name: c.name, description: c.description, preview: c.body,
                                                   agents: ["claude", "codex", "gemini", "opencode"],
                                                   path: "\(root)/.agents/skills/\(c.name)/SKILL.md", folder: c.folder))
            }
        }
    }

    // MARK: running

    /// Counted the way the Mac counts a run (lpm_commands_usage.rs).
    private func recordRun(_ project: String, _ command: DemoWorld.Command, _ scope: String) {
        try? updateCommands(project, scope) { list in
            guard let i = list.commands.firstIndex(where: { $0.name == command.name }) else { return }
            list.commands[i].runs += 1
            list.commands[i].lastRunAt = Int(Date().timeIntervalSince1970 * 1000)
            list.commands[i].ranAgo = nil
        }
    }

    private func expandCommand(_ project: String, name: String, args: String) throws -> (String, [String]) {
        guard let (command, scope) = effectiveCommand(project, name) else {
            throw DemoCommandError("/\(name) isn't one of your skills.")
        }
        recordRun(project, command, scope)
        let known = world.projects.first { $0.name == project }
        var auto: [String: String] = known.map {
            ["branch": world.git[project]?.branch ?? "main", "project": $0.label.isEmpty ? $0.name : $0.label]
        } ?? [:]
        auto["dir"] = "\(Self.skillsDir(scope, project))/\(command.name)"
        let args = args.trimmingCharacters(in: .whitespacesAndNewlines)
        let asks = Self.variables(command.body).filter { !Self.autoVariables.contains($0) }
        let values = Self.positional(args, asks.count)
        var missing: [String] = []
        var text = Self.replaceVariables(command.body) { variable in
            let value = Self.autoVariables.contains(variable)
                ? auto[variable]
                : asks.firstIndex(of: variable).flatMap { $0 < values.count ? values[$0] : nil }
            if value == nil, !missing.contains(variable) { missing.append(variable) }
            return value
        }
        let takesAll = text.contains("$ARGUMENTS")
        text = text.replacingOccurrences(of: "$ARGUMENTS", with: args)
        if !args.isEmpty && asks.isEmpty && !takesAll {
            while text.last?.isWhitespace == true { text.removeLast() }
            text += "\n\n" + args
        }
        return (text, missing)
    }

    /// The variables a run has to be given, as the `<a> <b>` hint after `/name `.
    private static func argumentHint(_ body: String) -> String {
        let asks = variables(body).filter { !autoVariables.contains($0) }
        if asks.isEmpty && body.contains("$ARGUMENTS") { return "<arguments>" }
        return asks.map { "<\($0)>" }.joined(separator: " ")
    }

    /// Each `{{name}}` in a prompt, once, in the order they first appear.
    private static func variables(_ body: String) -> [String] {
        var out: [String] = []
        _ = replaceVariables(body) { variable in
            if !out.contains(variable) { out.append(variable) }
            return nil
        }
        return out
    }

    /// `n` values from the arguments: a word each, the last taking the rest.
    private static func positional(_ args: String, _ n: Int) -> [String] {
        var out: [String] = []
        var rest = Substring(args.trimmingCharacters(in: .whitespacesAndNewlines))
        while out.count + 1 < n, !rest.isEmpty {
            let end = rest.firstIndex(where: \.isWhitespace) ?? rest.endIndex
            out.append(String(rest[..<end]))
            rest = rest[end...].drop(while: \.isWhitespace)
        }
        if n > 0, !rest.isEmpty { out.append(String(rest)) }
        return out
    }

    /// Every `{{name}}` rewritten with what `value` gives, the token left as it
    /// was when it gives nothing.
    private static func replaceVariables(_ body: String, _ value: (String) -> String?) -> String {
        var out = ""
        var rest = Substring(body)
        while let open = rest.range(of: "{{") {
            out += rest[..<open.lowerBound]
            let after = rest[open.upperBound...]
            guard let close = after.range(of: "}}") else {
                out += rest[open.lowerBound...]
                return out
            }
            let variable = after[..<close.lowerBound].trimmingCharacters(in: .whitespacesAndNewlines)
            let isName = !variable.isEmpty && variable.allSatisfy {
                $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "_" || $0 == "-")
            }
            if isName, let filled = value(variable) {
                out += filled
            } else {
                out += rest[open.lowerBound..<close.upperBound]
            }
            rest = after[close.upperBound...]
        }
        out += rest
        return out
    }
}

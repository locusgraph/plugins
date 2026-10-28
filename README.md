# LocusGraph plugins

Long-term memory for coding agents, backed by the LocusGraph engine's MCP server at
`https://api.locusgraph.com/mcp`.

Every adapter is a thin layer over that one server: an MCP entry, a rules file, and hooks where
the platform has them. There is no per-platform server code.

## Platforms

| Platform | Folder | MCP | Rules | Auto-recall | Paid-tool guard |
|---|---|---|---|---|---|
| Claude Code | `claude-code/` | `.mcp.json` | skill | `SessionStart` hook | `PreToolUse` hook |
| Cursor | `cursor/` | `.cursor/mcp.json` | `.cursor/rules/locusgraph.mdc` | no | `beforeMCPExecution` hook |
| Codex | `codex/` | `config.toml` | `AGENTS.md` | no | rules only |
| OpenCode | `opencode/` | `opencode.json` | `AGENTS.md` | no | rules only |
| Gemini CLI | `gemini/` | `gemini-extension.json` | `GEMINI.md` | no | `excludeTools` |
| VS Code Copilot | `vscode/` | `.vscode/mcp.json` | `.github/copilot-instructions.md` | no | rules only |

Planned next: Hermes, OpenClaw, Cline / Roo / Kilo, Windsurf, Zed, Claude Desktop, ChatGPT,
Vercel AI SDK, LangChain, n8n.

## Skills

Claude Code ships these. Every one uses free tools; the only cost is the writes they make.

| Skill | Fires when | Writes |
|---|---|---|
| `locusgraph-memory` | any task that could use past context | as needed |
| `locusgraph-handoff` | "wrap up", "hand off", end of day, switching machines | 1, `handoff:<repo>`, overwritten |
| `locusgraph-decision` | a choice is settled ("let's go with X") | 1, `decision:<repo>.<slug>`, linked to what it reverses |
| `locusgraph-known-fix` | an error appears, or a non-obvious bug is fixed | 1 after the fix passes, `fix:<repo>.<symptom>` |
| `locusgraph-project-brief` | "catch me up", "onboard me", "what did we decide" | none |
| `locusgraph-review` | "clean up memory", conflicting recall | only what the user approves |

Repository memories are named `<type>:<repo>.<slug>` and linked to `project:<repo>`, where
`<repo>` is the directory name of the git root. Session-start recall boosts `project:<repo>`
and `handoff:<repo>`, so a new session starts with that repository's decisions and the last
handoff.

The sources live in `skills/`; `npm run build` copies them into `claude-code/skills/`.

## Free by default

| Tool | Cost |
|---|---|
| `retrieve_memories`, `list_contexts`, `delete_memory` | free |
| `store_event` | one unit of the writes allowance per memory, no LLM |
| `observe`, `deep_recall` | spend credits on a server-side LLM |

Every adapter points at `/mcp?tools=free` and tells the agent not to call the paid tools.
Where the platform has hooks, the guard enforces it: a call to `observe` or `deep_recall` is
refused unless `LOCUSGRAPH_PAID=1` is set.

Until the engine honours `?tools=free`, the parameter is ignored and the paid tools are still
listed. On platforms without hooks, only the rules file stands between the agent and a paid
call.

## Install

One command, for every agent it finds in the project and home directory:

```
npx @locusgraph/cli init               # lists what it found, writes nothing
npx @locusgraph/cli init --yes         # installs everything it found
npx @locusgraph/cli init cursor codex  # installs only these, no --yes needed
```

It merges into existing `mcp.json`, `opencode.json`, `.gemini/settings.json`,
`~/.codex/config.toml`, `AGENTS.md`, `GEMINI.md` and `copilot-instructions.md` rather than
overwriting them. The rules sit between `<!-- locusgraph:start -->` and
`<!-- locusgraph:end -->`, so a rerun updates that block and nothing else. A config with
comments is refused, not rewritten. Codex is configured in `~/.codex/config.toml`, which is
global; every other platform is configured per project.

The per-platform steps below do the same by hand.

Sign-in is OAuth. The first tool call opens the browser, and the consent screen picks the
graph the token is scoped to.

### Claude Code

```
/plugin marketplace add locusgraph/plugins
/plugin install locusgraph@locusgraph
```

Session-start recall calls the REST API directly, because a hook cannot reuse the MCP OAuth
token. It needs a graph-scoped key from the console. Without these variables the hook stays
silent and the MCP tools still work.

```
export LOCUSGRAPH_TOKEN=<key>
export LOCUSGRAPH_GRAPH_ID=<graph id>
```

Commands: `/locusgraph:why`, `/locusgraph:remember`, `/locusgraph:forget`.

### Cursor

Copy `cursor/.cursor/` into the project root. The hook runs `node .cursor/hooks/lg.mjs`.

### Codex

Append `codex/config.toml` to `~/.codex/config.toml`, then run `codex mcp login locusgraph`.
Copy `codex/AGENTS.md` into the project, or merge it into an existing one.

### OpenCode

Merge `opencode/opencode.json` into the project's `opencode.json` and copy `AGENTS.md`.

### Gemini CLI

```
gemini extensions link ./gemini
```

### VS Code Copilot

Copy `vscode/.vscode/mcp.json` and `vscode/.github/copilot-instructions.md` into the project.

## Develop

`rules/memory.md` is the one source for every rules file, and `cli/lg.mjs` is the one source
for every hook script. `cli/` is the `@locusgraph/cli` package: `lg recall` and `lg guard`
run from hooks, `lg init` installs. Edit those, then regenerate:

```
npm run build
npm run check
```

`check` fails when a generated file is out of date, and runs the CLI tests.

## Unverified

Each platform's config shape was written from its documentation, not tested against a running
client. Confirm before announcing support:

| Platform | Check |
|---|---|
| Cursor | `beforeMCPExecution` input carries `tool_name`, and a `deny` answer blocks the call |
| Codex | remote `url` servers and `codex mcp login` work against the engine's OAuth issuer |
| Gemini CLI | `excludeTools` applies to MCP tools inside an extension |
| All | the engine's OAuth issuer accepts each client's redirect URI and registration |
| Claude Code | `privacyPolicyUrl` in `plugin.json` before submitting to the plugin directory |

## License

MIT. See `LICENSE`.

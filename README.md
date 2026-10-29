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
| `locusgraph-decision` | a choice is settled ("let's go with X") | 1, `decision:<repo>__<slug>`, linked to what it reverses |
| `locusgraph-known-fix` | an error appears, or a non-obvious bug is fixed | 1 after the fix passes, `fix:<repo>__<symptom>` |
| `locusgraph-project-brief` | "catch me up", "onboard me", "what did we decide" | none |
| `locusgraph-review` | "clean up memory", conflicting recall | only what the user approves |

Repository memories are named `<type>:<repo>__<slug>` and linked to `project:<repo>`, where
`<repo>` is the directory name of the git root, lowercased, with anything outside `a-z0-9_-`
turned into `_`. The engine stores ids in that form but looks them up as sent, so the plugin
writes them that way from the start. Session-start recall boosts `project:<repo>`
and `handoff:<repo>`, so a new session starts with that repository's decisions and the last
handoff.

The skills that write a repository memory first store an anchor, `project:<repo>`, holding one
sentence on what the repository is. It is written once: a second attempt is refused because
the id already holds a memory, and the skills read that refusal as "already there". The
anchor matters because the engine binds a `related_to` edge only to a context some memory
owns; without it every link to `project:<repo>` stays unresolved, and graph expansion cannot
walk from one of the repository's memories to the rest.

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

One click for the MCP server in Cursor or VS Code:

<!-- install-buttons:start -->
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=locusgraph&config=eyJ1cmwiOiJodHRwczovL2FwaS5sb2N1c2dyYXBoLmNvbS9tY3A%2FdG9vbHM9ZnJlZSJ9)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_LocusGraph-0098FF?logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect/mcp/install?name=locusgraph&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fapi.locusgraph.com%2Fmcp%3Ftools%3Dfree%22%7D)
[![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install_LocusGraph-24bfa5?logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=locusgraph&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fapi.locusgraph.com%2Fmcp%3Ftools%3Dfree%22%7D)
<!-- install-buttons:end -->

The buttons add the server only. The rules that tell the agent when to recall and store come
from `lg init cursor` or `lg init vscode`. `lg links --engine dev` prints the same links for
the dev engine.

One command, for every agent it finds in the project and home directory:

```
npx @locusgraph/cli init               # lists what it found, writes nothing
npx @locusgraph/cli init --yes         # installs everything it found
npx @locusgraph/cli init cursor codex  # installs only these, no --yes needed
npx @locusgraph/cli init cursor --engine dev   # point at api.dev.locusgraph.com
```

`--engine` takes `production` (the default), `dev`, or a URL: any `https://` origin, or
`http://localhost` / `http://127.0.0.1` for a local Worker. Rerunning with another engine
rewrites the URL in place, including the Codex table.

Claude Code's plugin reads the engine from `LOCUSGRAPH_URL` for both the MCP server and
session-start recall, so `export LOCUSGRAPH_URL=https://api.dev.locusgraph.com` before
starting Claude Code switches it; `lg init claude-code --engine dev` prints that line.

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

Nothing else to configure: the consent screen is the only setup. At session start the hook
asks Claude to call `retrieve_memories` once for this repository, and that call goes through
the MCP server's OAuth token.

A hook cannot reuse that token, so recall costs one tool call. To skip it, give the hook a
graph-scoped key from the console; it then fetches the memories itself over REST and injects
them directly. This is optional, and useful in CI where nobody can sign in.

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

The CLI is TypeScript in `cli/src`, bundled by esbuild into one `lg.mjs` that runs on Node 18
with no dependencies. Development needs Node 22.18 or later, which runs `scripts/build.ts`
directly.

```
cli/src/
  bin.ts              process entry: runs main, writes stdout and stderr, sets the exit code
  main.ts             command table: recall, guard, init, links
  commands/           one file per command, each returning a CommandResult and doing no I/O to the terminal
  platforms/          one file per agent: detect() and install(); index.ts lists them
  config.ts           engines, MCP URL, paid tool names
  deeplinks.ts        Cursor and VS Code install links, and the README buttons
  engine-flag.ts      --engine, shared by init and links
  env.ts              LOCUSGRAPH_* variables, read once
  engine.ts           the one REST call: POST /v1/memories
  files.ts            JSON merge, rules block, TOML table
  hook-input.ts       the JSON a hook receives on stdin
  paid-tools.ts       which tool calls the guard refuses
  workspace.ts        repo name and recall query from git
  generated/rules.ts  rules/memory.md as a string, written by the build
cli/test/             vitest; bundle.test.ts runs the committed hook bundles
```

`rules/memory.md` is the one source for every rules file, and `skills/` for every skill.
`npm run build` regenerates the rules files and the README install buttons, copies the skills
and licence, and bundles the CLI
into `claude-code/hooks/lg.mjs`, `cursor/.cursor/hooks/lg.mjs` and `cli/dist/lg.mjs`.

```
npm ci
npm run build
npm run check    # build --check, biome, tsc, vitest
```

`check` fails when a committed generated file is out of date. Adding a platform is one file in
`cli/src/platforms/` and one line in its `index.ts`.

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

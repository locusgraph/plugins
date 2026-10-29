#!/usr/bin/env node

// cli/src/main.ts
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

// cli/src/config.ts
var ENGINES = {
  production: "https://api.locusgraph.com",
  dev: "https://api.dev.locusgraph.com"
};
var DEFAULT_ENGINE_URL = ENGINES.production;
var PAID_TOOLS = ["observe", "deep_recall"];
function mcpUrlFor(engineUrl) {
  return `${engineUrl}/mcp?tools=free`;
}
function resolveEngine(value) {
  if (value in ENGINES) return ENGINES[value];
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return void 0;
    return url.origin;
  } catch {
    return void 0;
  }
}

// cli/src/paid-tools.ts
var PAID_TOOL_NAME = new RegExp(`(^|__)(${PAID_TOOLS.join("|")})$`);
function judgeToolCall(toolName, paidToolsEnabled) {
  if (paidToolsEnabled || !PAID_TOOL_NAME.test(toolName)) return { allowed: true };
  return {
    allowed: false,
    reason: `${toolName} spends LocusGraph credits and is disabled. Use retrieve_memories (free) instead, or set LOCUSGRAPH_PAID=1 to enable paid tools.`
  };
}

// cli/src/commands/guard.ts
function guard(input, env, dialect) {
  const verdict = judgeToolCall(
    String(input.tool_name ?? input.toolName ?? ""),
    env.paidToolsEnabled
  );
  if (dialect === "cursor") {
    const answer = verdict.allowed ? { permission: "allow" } : { permission: "deny", userMessage: verdict.reason, agentMessage: verdict.reason };
    return { exitCode: 0, stdout: JSON.stringify(answer) };
  }
  return verdict.allowed ? { exitCode: 0 } : { exitCode: 2, stderr: `${verdict.reason}
` };
}

// cli/src/commands/init.ts
import { relative } from "node:path";

// cli/src/platforms/claude-code.ts
import { existsSync } from "node:fs";
import { join } from "node:path";
var claudeCode = {
  id: "claude-code",
  label: "Claude Code",
  nextStep: ({ engineUrl }) => (engineUrl === DEFAULT_ENGINE_URL ? "" : `export LOCUSGRAPH_URL=${engineUrl}, then `) + "in Claude Code: /plugin marketplace add locusgraph/plugins, then /plugin install locusgraph@locusgraph",
  detect: ({ home }) => existsSync(join(home, ".claude")),
  install: async () => []
};

// cli/src/platforms/codex.ts
import { existsSync as existsSync2 } from "node:fs";
import { join as join2 } from "node:path";

// cli/src/files.ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
var RULES_START = "<!-- locusgraph:start -->";
var RULES_END = "<!-- locusgraph:end -->";
function asObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}
async function readText(path) {
  return readFile(path, "utf8").catch(() => null);
}
async function writeText(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}
async function mergeJson(path, merge) {
  const current = await readText(path);
  let parsed = {};
  if (current !== null && current.trim() !== "") {
    try {
      parsed = asObject(JSON.parse(current));
    } catch {
      throw new Error(`${path} is not plain JSON; add the locusgraph entry by hand`);
    }
  }
  await writeText(path, `${JSON.stringify(merge(parsed), null, 2)}
`);
}
function withLocusGraphServer(key, entry) {
  return (config) => ({
    ...config,
    [key]: { ...asObject(config[key]), locusgraph: entry }
  });
}
function replaceRulesBlock(current, rules) {
  const block = `${RULES_START}
${rules.trim()}
${RULES_END}
`;
  const start = current.indexOf(RULES_START);
  const end = current.indexOf(RULES_END);
  if (start !== -1 && end > start) {
    return current.slice(0, start) + block + current.slice(end + RULES_END.length).replace(/^\n/, "");
  }
  return current === "" ? block : `${current.replace(/\n*$/, "\n\n")}${block}`;
}
async function upsertRulesBlock(path, rules) {
  await writeText(path, replaceRulesBlock(await readText(path) ?? "", rules));
}
function replaceTomlTable(current, table, body) {
  const header = `[${table}]`;
  const section = `${header}
${body}
`;
  const lines = current.split("\n");
  const start = lines.findIndex((line) => line.trim() === header);
  if (start === -1) {
    return `${current === "" ? "" : current.replace(/\n*$/, "\n\n")}${section}`;
  }
  const next = lines.findIndex(
    (line, index) => index > start && line.trimStart().startsWith("[")
  );
  const before = lines.slice(0, start).join("\n");
  const after = next === -1 ? "" : `
${lines.slice(next).join("\n")}`;
  return `${before}${before === "" ? "" : "\n"}${section}${after}`;
}
async function upsertTomlTable(path, table, body) {
  await writeText(path, replaceTomlTable(await readText(path) ?? "", table, body));
}

// cli/src/platforms/codex.ts
var codex = {
  id: "codex",
  label: "Codex",
  writesGlobal: "~/.codex/config.toml",
  nextStep: () => "codex mcp login locusgraph",
  detect: ({ home }) => existsSync2(join2(home, ".codex")),
  async install({ cwd, home, rules, mcpUrl }) {
    const config = join2(home, ".codex/config.toml");
    await upsertTomlTable(config, "mcp_servers.locusgraph", `url = "${mcpUrl}"`);
    await upsertRulesBlock(join2(cwd, "AGENTS.md"), rules);
    return [config, "AGENTS.md"];
  }
};

// cli/src/platforms/cursor.ts
import { existsSync as existsSync3 } from "node:fs";
import { copyFile, mkdir as mkdir2 } from "node:fs/promises";
import { join as join3 } from "node:path";
var GUARD_COMMAND = "node .cursor/hooks/lg.mjs guard --cursor";
var cursor = {
  id: "cursor",
  label: "Cursor",
  detect: ({ cwd }) => existsSync3(join3(cwd, ".cursor")),
  async install({ cwd, rules, hookScript, mcpUrl }) {
    await mergeJson(
      join3(cwd, ".cursor/mcp.json"),
      withLocusGraphServer("mcpServers", { url: mcpUrl })
    );
    await writeText(
      join3(cwd, ".cursor/rules/locusgraph.mdc"),
      `---
description: LocusGraph long-term memory
alwaysApply: true
---

${rules}`
    );
    await mkdir2(join3(cwd, ".cursor/hooks"), { recursive: true });
    await copyFile(hookScript, join3(cwd, ".cursor/hooks/lg.mjs"));
    await mergeJson(join3(cwd, ".cursor/hooks.json"), (config) => {
      const hooks = asObject(config.hooks);
      const existing = Array.isArray(hooks.beforeMCPExecution) ? hooks.beforeMCPExecution : [];
      const guarded = existing.some((hook) => asObject(hook).command === GUARD_COMMAND);
      return {
        version: 1,
        ...config,
        hooks: {
          ...hooks,
          beforeMCPExecution: guarded ? existing : [...existing, { command: GUARD_COMMAND }]
        }
      };
    });
    return [
      ".cursor/mcp.json",
      ".cursor/rules/locusgraph.mdc",
      ".cursor/hooks.json",
      ".cursor/hooks/lg.mjs"
    ];
  }
};

// cli/src/platforms/gemini.ts
import { existsSync as existsSync4 } from "node:fs";
import { join as join4 } from "node:path";
var gemini = {
  id: "gemini",
  label: "Gemini CLI",
  detect: ({ cwd, home }) => existsSync4(join4(cwd, ".gemini")) || existsSync4(join4(home, ".gemini")),
  async install({ cwd, rules, mcpUrl }) {
    await mergeJson(
      join4(cwd, ".gemini/settings.json"),
      withLocusGraphServer("mcpServers", { httpUrl: mcpUrl, excludeTools: [...PAID_TOOLS] })
    );
    await upsertRulesBlock(join4(cwd, "GEMINI.md"), rules);
    return [".gemini/settings.json", "GEMINI.md"];
  }
};

// cli/src/platforms/opencode.ts
import { existsSync as existsSync5 } from "node:fs";
import { join as join5 } from "node:path";
var opencode = {
  id: "opencode",
  label: "OpenCode",
  detect: ({ cwd, home }) => existsSync5(join5(cwd, "opencode.json")) || existsSync5(join5(home, ".config/opencode")),
  async install({ cwd, rules, mcpUrl }) {
    await mergeJson(join5(cwd, "opencode.json"), (config) => ({
      $schema: "https://opencode.ai/config.json",
      ...withLocusGraphServer("mcp", { type: "remote", url: mcpUrl, enabled: true })(config)
    }));
    await upsertRulesBlock(join5(cwd, "AGENTS.md"), rules);
    return ["opencode.json", "AGENTS.md"];
  }
};

// cli/src/platforms/vscode.ts
import { existsSync as existsSync6 } from "node:fs";
import { join as join6 } from "node:path";
var vscode = {
  id: "vscode",
  label: "VS Code Copilot",
  detect: ({ cwd }) => existsSync6(join6(cwd, ".vscode")),
  async install({ cwd, rules, mcpUrl }) {
    await mergeJson(
      join6(cwd, ".vscode/mcp.json"),
      withLocusGraphServer("servers", { type: "http", url: mcpUrl })
    );
    await upsertRulesBlock(join6(cwd, ".github/copilot-instructions.md"), rules);
    return [".vscode/mcp.json", ".github/copilot-instructions.md"];
  }
};

// cli/src/platforms/index.ts
var PLATFORMS = [
  cursor,
  codex,
  opencode,
  gemini,
  vscode,
  claudeCode
];
function findPlatform(id) {
  return PLATFORMS.find((platform) => platform.id === id);
}

// cli/src/engine-flag.ts
var ENGINE_FLAG = "--engine";
var ENGINE_CHOICES = `${Object.keys(ENGINES).join(", ")}, or an https:// URL`;
function engineFrom(value) {
  if (value === void 0 || value === "") {
    return new Error(`${ENGINE_FLAG} needs a value: ${ENGINE_CHOICES}`);
  }
  return resolveEngine(value) ?? new Error(`unknown engine: ${value}. Choose ${ENGINE_CHOICES}`);
}
function takeEngineFlag(args) {
  let engineUrl = DEFAULT_ENGINE_URL;
  const rest = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] ?? "";
    if (arg !== ENGINE_FLAG && !arg.startsWith(`${ENGINE_FLAG}=`)) {
      rest.push(arg);
      continue;
    }
    index += arg === ENGINE_FLAG ? 1 : 0;
    const engine = engineFrom(
      arg === ENGINE_FLAG ? args[index] : arg.slice(ENGINE_FLAG.length + 1)
    );
    if (engine instanceof Error) return engine;
    engineUrl = engine;
  }
  return { engineUrl, rest };
}

// cli/src/commands/init-args.ts
var CONFIRM_FLAG = "--yes";
function parseInitArgs(args) {
  const selection = takeEngineFlag(args);
  if (selection instanceof Error) return selection;
  return {
    confirmed: selection.rest.includes(CONFIRM_FLAG),
    platformIds: selection.rest.filter((arg) => arg !== CONFIRM_FLAG),
    engineUrl: selection.engineUrl
  };
}

// cli/src/commands/init.ts
var PLATFORM_IDS = PLATFORMS.map((platform) => platform.id);
function displayPath(path, { cwd, home }) {
  if (!path.startsWith("/")) return path;
  if (path.startsWith(cwd)) return relative(cwd, path);
  return path.startsWith(home) ? `~/${relative(home, path)}` : path;
}
function describePlan(platforms) {
  const rows = platforms.map(
    (platform) => `  ${platform.id.padEnd(12)}${platform.label}` + (platform.writesGlobal === void 0 ? "" : ` (also writes ${platform.writesGlobal}, which is global)`)
  );
  const first = platforms[0]?.id ?? "";
  return [
    "found:",
    ...rows,
    `nothing written. Run lg init ${CONFIRM_FLAG} to install all of them, or name the ones you want: lg init ${first}`
  ];
}
async function installAll(platforms, context) {
  const lines = [];
  let failed = false;
  for (const platform of platforms) {
    try {
      const written = (await platform.install(context)).map(
        (path) => displayPath(path, context)
      );
      lines.push(`\u2714 ${platform.label}${written.length > 0 ? `: ${written.join(", ")}` : ""}`);
      const next = platform.nextStep?.(context);
      if (next !== void 0 && next !== "") lines.push(`  next: ${next}`);
    } catch (error) {
      failed = true;
      lines.push(
        `\u2718 ${platform.label}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  lines.push("\u2192 the first LocusGraph tool call opens the browser to sign in");
  return { lines, failed };
}
var output = (exitCode, lines) => ({
  exitCode,
  stdout: `${lines.join("\n")}
`
});
async function init(args, environment) {
  const parsed = parseInitArgs(args);
  if (parsed instanceof Error) return output(1, [parsed.message]);
  const { confirmed, platformIds, engineUrl } = parsed;
  const unknown = platformIds.filter((id) => findPlatform(id) === void 0);
  if (unknown.length > 0) {
    return output(1, [
      `unknown platform: ${unknown.join(", ")}. Choose from: ${PLATFORM_IDS.join(", ")}`
    ]);
  }
  const context = { ...environment, engineUrl, mcpUrl: mcpUrlFor(engineUrl) };
  const chosen = platformIds.length > 0 ? platformIds.flatMap((id) => findPlatform(id) ?? []) : PLATFORMS.filter((platform) => platform.detect(context));
  if (chosen.length === 0) {
    return output(1, [
      `no supported agent found here. Name one: lg init <${PLATFORM_IDS.join("|")}>`
    ]);
  }
  const engineLine = engineUrl === DEFAULT_ENGINE_URL ? [] : [`engine: ${engineUrl}`];
  if (platformIds.length === 0 && !confirmed) {
    return output(0, [...engineLine, ...describePlan(chosen)]);
  }
  const { lines, failed } = await installAll(chosen, context);
  return output(failed ? 1 : 0, [...engineLine, ...lines]);
}

// cli/src/deeplinks.ts
var SERVER_NAME = "locusgraph";
function base64(text) {
  return Buffer.from(text, "utf8").toString("base64");
}
function cursorInstallLink(mcpUrl) {
  const config = base64(JSON.stringify({ url: mcpUrl }));
  return `https://cursor.com/install-mcp?name=${SERVER_NAME}&config=${encodeURIComponent(config)}`;
}
function vscodeInstallLink(mcpUrl, host = "vscode.dev") {
  const config = encodeURIComponent(JSON.stringify({ type: "http", url: mcpUrl }));
  return `https://${host}/redirect/mcp/install?name=${SERVER_NAME}&config=${config}`;
}
function installLinks(engineUrl) {
  const mcpUrl = mcpUrlFor(engineUrl);
  return {
    cursor: cursorInstallLink(mcpUrl),
    vscode: vscodeInstallLink(mcpUrl),
    vscodeInsiders: vscodeInstallLink(mcpUrl, "insiders.vscode.dev")
  };
}

// cli/src/commands/links.ts
function links(args) {
  const selection = takeEngineFlag(args);
  if (selection instanceof Error) return { exitCode: 1, stderr: `${selection.message}
` };
  if (selection.rest.length > 0) {
    return { exitCode: 1, stderr: `unexpected argument: ${selection.rest.join(" ")}
` };
  }
  const { cursor: cursor2, vscode: vscode2, vscodeInsiders } = installLinks(selection.engineUrl);
  const engineLine = selection.engineUrl === DEFAULT_ENGINE_URL ? [] : [`engine: ${selection.engineUrl}`];
  const lines = [
    ...engineLine,
    `Cursor:           ${cursor2}`,
    `VS Code:          ${vscode2}`,
    `VS Code Insiders: ${vscodeInsiders}`,
    "These install the MCP server only. Run lg init cursor or lg init vscode for the rules."
  ];
  return { exitCode: 0, stdout: `${lines.join("\n")}
` };
}

// cli/src/recall-query.ts
function recallArguments({ repo, query }) {
  return {
    query,
    limit: 6,
    format: "toon",
    boost_context_ids: [`project:${repo}`, `handoff:${repo}`]
  };
}

// cli/src/engine.ts
var RECALL_TIMEOUT_MS = 4e3;
var fetchMemories = async (env, workspace) => {
  if (env.token === void 0 || env.graphId === void 0) return "";
  try {
    const response = await fetch(`${env.engineUrl}/v1/memories`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.token}`, "content-type": "application/json" },
      body: JSON.stringify({ graph_id: env.graphId, ...recallArguments(workspace) }),
      signal: AbortSignal.timeout(RECALL_TIMEOUT_MS)
    });
    if (!response.ok) return "";
    const body = await response.json();
    return typeof body.data?.memories === "string" ? body.data.memories.trim() : "";
  } catch {
    return "";
  }
};

// cli/src/workspace.ts
import { execFileSync } from "node:child_process";
import { basename } from "node:path";
function git(cwd, ...args) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "";
  }
}
function contextSafeName(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
}
function describeWorkspace(cwd) {
  const repo = contextSafeName(basename(git(cwd, "rev-parse", "--show-toplevel") || cwd));
  const branch = git(cwd, "branch", "--show-current");
  const recentSubjects = git(cwd, "log", "-5", "--format=%s");
  return { repo, query: [repo, branch, recentSubjects].filter(Boolean).join("\n") };
}

// cli/src/commands/recall.ts
var STORE_AFTER_COMPACT = "LocusGraph: the conversation was just compacted. Before continuing, store at most 3 durable decisions, constraints or user corrections from the summary above with `store_event` (source: user or assistant, a stable `type:name` context_id). Skip anything already in CLAUDE.md, AGENTS.md or git history. If nothing qualifies, store nothing.";
function recallInstruction(workspace) {
  return `LocusGraph: before starting the user's first task, call the LocusGraph \`retrieve_memories\` tool once with these arguments: ${JSON.stringify(recallArguments(workspace))}. Treat what it returns as background on this repository and do not repeat the call for it. If the LocusGraph tools are not available, skip this.`;
}
function hasRestCredentials(env) {
  return env.token !== void 0 && env.graphId !== void 0;
}
async function recallSection(env, workspace, fetch2) {
  if (!hasRestCredentials(env)) return recallInstruction(workspace);
  const memories = await fetch2(env, workspace);
  return memories === "" ? "" : `LocusGraph memories for this workspace:
${memories}`;
}
async function recall(input, env, { afterCompact, fetch: fetch2 = fetchMemories, workspace }) {
  const sections = [
    await recallSection(env, workspace ?? describeWorkspace(input.cwd || process.cwd()), fetch2),
    afterCompact ? STORE_AFTER_COMPACT : ""
  ].filter((section) => section !== "");
  return sections.length === 0 ? { exitCode: 0 } : { exitCode: 0, stdout: `${sections.join("\n\n")}
` };
}

// cli/src/env.ts
function readEnv(env) {
  return {
    engineUrl: (env.LOCUSGRAPH_URL || DEFAULT_ENGINE_URL).replace(/\/+$/, ""),
    token: env.LOCUSGRAPH_TOKEN || void 0,
    graphId: env.LOCUSGRAPH_GRAPH_ID || void 0,
    paidToolsEnabled: env.LOCUSGRAPH_PAID === "1"
  };
}

// generated-rules:./generated/rules.ts
var RULES = '# LocusGraph memory\n\nLocusGraph is long-term memory that persists across sessions, projects and tools. It is\nreached through the `locusgraph` MCP server.\n\n## Recall\n\n- Before a non-trivial task, call `retrieve_memories` with the user\'s request in their own\n  words. Use `format: "toon"` and `limit: 5` unless more is needed.\n- For a question that spans linked memories ("why did we choose X?"), walk the graph yourself:\n  `list_contexts` to find the relevant `decision:` or `constraint:` ids, then\n  `retrieve_memories` with those ids in `boost_context_ids`.\n- Memories already injected at session start do not need to be fetched again.\n\n## Store\n\n- Call `store_event` only for durable knowledge: a decision and its reason, a constraint, a\n  user preference or correction, a non-obvious fix.\n- Use a stable `context_id` in `type:name` form, such as `decision:use_postgres` or\n  `preference:no_code_comments`. One id holds one memory. Update it with `replace: true`.\n  Link a new detail to an existing memory with `extends`.\n- For knowledge about one repository, prefix the name with the repository\'s directory name,\n  joined by a double underscore, such as `decision:engine__use_d1_batch_only`, and add\n  `project:<repo>` to `related_to`. Session-start recall boosts `project:<repo>`, so linked\n  memories surface first.\n- Each repository has one anchor memory that owns `project:<repo>`, holding one sentence on\n  what the repository is. Without an owner, the `related_to` links to `project:<repo>` are\n  stored but never bind, so graph expansion cannot walk between that repository\'s memories.\n  Before the first repository memory in a session, call `store_event` on `project:<repo>`\n  (`event_kind: "fact"`, `source: "assistant"`) without `replace`; an answer that the id\n  already holds a memory means the anchor exists.\n- Build ids only from `a-z`, `0-9`, `_`, `-` and the one `:`. The engine lowercases an id and\n  turns any other character into `_` when it stores it, but looks ids up exactly as sent, so an\n  id with a dot or a capital is stored under one name and searched for under another. The\n  same goes for `<repo>`: `My.Repo` is `my_repo`.\n- Put one concise sentence in `payload.data`. Search matches on that text.\n- Set `source: "user"` when the user said it, `"assistant"` when you inferred it.\n- Store at most a few memories per session. Never store secrets, tokens, credentials or\n  anything already recorded in the repository\'s instruction files or git history.\n\n## Forget\n\n- Call `delete_memory` only when the user explicitly asks to forget something. Find the\n  `locus_id` with `retrieve_memories` using `format: "json"`, and confirm with the user first.\n\n## Paid tools\n\n- `observe` and `deep_recall` spend credits. Do not call them unless the user asks for them\n  by name or has enabled paid tools.\n';

// cli/src/hook-input.ts
function parseHookInput(text) {
  try {
    const value = JSON.parse(text);
    return typeof value === "object" && value !== null ? value : {};
  } catch {
    return {};
  }
}
async function readHookInput(stdin = process.stdin) {
  if (stdin.isTTY) return {};
  let text = "";
  for await (const chunk of stdin) text += chunk;
  return parseHookInput(text);
}

// cli/src/main.ts
var COMMANDS = {
  recall: async (args) => recall(await readHookInput(), readEnv(process.env), {
    afterCompact: args.includes("--after-compact")
  }),
  guard: async (args) => guard(
    await readHookInput(),
    readEnv(process.env),
    args.includes("--cursor") ? "cursor" : "claude"
  ),
  init: (args) => init(args, {
    cwd: process.cwd(),
    home: homedir(),
    rules: RULES,
    hookScript: fileURLToPath(import.meta.url)
  }),
  links: async (args) => links(args)
};
async function main(argv) {
  const [name = "", ...args] = argv;
  const command = COMMANDS[name];
  if (command === void 0) {
    return { exitCode: 1, stderr: `usage: lg <${Object.keys(COMMANDS).join("|")}> [args]
` };
  }
  return command(args);
}

// cli/src/bin.ts
var result = await main(process.argv.slice(2));
if (result.stdout !== void 0) process.stdout.write(result.stdout);
if (result.stderr !== void 0) process.stderr.write(result.stderr);
process.exitCode = result.exitCode;

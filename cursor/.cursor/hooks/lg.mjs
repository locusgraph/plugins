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

// cli/src/platforms/claude-code.ts
var CLAUDE_CODE_READ_TOOLS = [
  "mcp__plugin_locusgraph_locusgraph__retrieve_memories",
  "mcp__plugin_locusgraph_locusgraph__list_contexts"
];
var SETTINGS = ".claude/settings.json";
var claudeCode = {
  id: "claude-code",
  label: "Claude Code",
  writesGlobal: `~/${SETTINGS}`,
  nextStep: ({ engineUrl }) => (engineUrl === DEFAULT_ENGINE_URL ? "" : `export LOCUSGRAPH_URL=${engineUrl}, then `) + "in Claude Code: /plugin marketplace add locusgraph/plugins, then /plugin install locusgraph@locusgraph",
  detect: ({ home }) => existsSync(join(home, ".claude")),
  install: async ({ home }) => {
    const settings = join(home, SETTINGS);
    await mergeJson(settings, (config) => {
      const permissions = asObject(config.permissions);
      const allow = Array.isArray(permissions.allow) ? permissions.allow : [];
      const missing = CLAUDE_CODE_READ_TOOLS.filter((tool) => !allow.includes(tool));
      return { ...config, permissions: { ...permissions, allow: [...allow, ...missing] } };
    });
    return [settings];
  }
};

// cli/src/platforms/codex.ts
import { existsSync as existsSync2 } from "node:fs";
import { join as join2 } from "node:path";
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

// cli/src/credentials.ts
import { chmod, mkdir as mkdir3, readFile as readFile2, rm, writeFile as writeFile2 } from "node:fs/promises";
import { dirname as dirname2, join as join7 } from "node:path";
function credentialsPath(env, home) {
  const base = env.XDG_CONFIG_HOME || join7(home, ".config");
  return join7(base, "locusgraph", "credentials.json");
}
async function readCredentials(path) {
  try {
    const value = JSON.parse(await readFile2(path, "utf8"));
    const { key, graph_id: graphId, engine_url: engineUrl } = value;
    if (typeof key !== "string" || key === "") return void 0;
    if (typeof graphId !== "string" || graphId === "") return void 0;
    if (typeof engineUrl !== "string" || engineUrl === "") return void 0;
    return { key, graphId, engineUrl };
  } catch {
    return void 0;
  }
}
async function writeCredentials(path, credentials) {
  await mkdir3(dirname2(path), { recursive: true, mode: 448 });
  const body = {
    key: credentials.key,
    graph_id: credentials.graphId,
    engine_url: credentials.engineUrl
  };
  await writeFile2(path, `${JSON.stringify(body, null, 2)}
`, { mode: 384 });
  await chmod(path, 384);
}
async function removeCredentials(path) {
  try {
    await rm(path);
    return true;
  } catch {
    return false;
  }
}

// cli/src/recall-query.ts
function recallArguments({ repo, query }) {
  return {
    query,
    limit: 6,
    format: "toon",
    boost_context_ids: [`project:${repo}`],
    coverage_context_ids: [`handoff:${repo}`]
  };
}

// cli/src/engine.ts
var RECALL_TIMEOUT_MS = 4e3;
var SKILL_MATCH_TIMEOUT_MS = 2500;
var SKILL_MATCH_MIN_SCORE = 0.6;
async function retrieve(env, body, timeoutMs) {
  if (env.token === void 0 || env.graphId === void 0) return { ok: false, status: 0 };
  try {
    const response = await fetch(`${env.engineUrl}/v1/memories`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.token}`, "content-type": "application/json" },
      body: JSON.stringify({ graph_id: env.graphId, ...body }),
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) return { ok: false, status: response.status };
    const json = await response.json();
    const data = json.data;
    return typeof data === "object" && data !== null ? { ok: true, data } : { ok: false, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}
var fetchMemories = async (env, workspace) => {
  const result2 = await retrieve(env, { ...recallArguments(workspace) }, RECALL_TIMEOUT_MS);
  if (!result2.ok) return "";
  const memories = result2.data.memories;
  return typeof memories === "string" ? memories.trim() : "";
};
var matchSkill = async (env, prompt) => {
  const result2 = await retrieve(
    env,
    {
      query: prompt,
      context_types: { skill: [] },
      ranking: "similarity",
      format: "json",
      limit: 3
    },
    SKILL_MATCH_TIMEOUT_MS
  );
  if (!result2.ok || !Array.isArray(result2.data.items)) return void 0;
  let best;
  for (const item of result2.data.items) {
    if (typeof item !== "object" || item === null) continue;
    const { context_ids: ids, text, match_score: score } = item;
    if (typeof text !== "string" || typeof score !== "number" || !Array.isArray(ids)) continue;
    const contextId = ids.find(
      (id) => typeof id === "string" && id.startsWith("skill:")
    );
    if (contextId === void 0 || score < SKILL_MATCH_MIN_SCORE) continue;
    if (best === void 0 || score > best.score) best = { contextId, text, score };
  }
  return best;
};

// cli/src/commands/login.ts
var GRAPH_FLAG = "--graph";
var CHECK_TIMEOUT_MS = 8e3;
var checkKey = (env) => retrieve(
  env,
  { query: "locusgraph login check", limit: 1, format: "json" },
  CHECK_TIMEOUT_MS
);
var usage = "usage: <print your key> | lg login --graph <graph_id> [--engine <production|dev|url>]\nThe key is read from stdin, so it stays out of your shell history. Use a key limited to memory.read on that graph.\n";
function takeGraphFlag(args) {
  const rest = [];
  let graphId;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] ?? "";
    if (arg === GRAPH_FLAG || arg.startsWith(`${GRAPH_FLAG}=`)) {
      const value = arg === GRAPH_FLAG ? args[++index] : arg.slice(GRAPH_FLAG.length + 1);
      if (value === void 0 || value === "") return new Error(`${GRAPH_FLAG} needs a value`);
      graphId = value;
    } else {
      rest.push(arg);
    }
  }
  return graphId === void 0 ? { rest } : { graphId, rest };
}
async function login(args, { key, credentialsPath: credentialsPath2, paidToolsEnabled, check = checkKey }) {
  const engine = takeEngineFlag(args);
  if (engine instanceof Error) return { exitCode: 1, stderr: `${engine.message}
` };
  const graph = takeGraphFlag(engine.rest);
  if (graph instanceof Error) return { exitCode: 1, stderr: `${graph.message}
${usage}` };
  if (graph.rest.length > 0) {
    return { exitCode: 1, stderr: `unexpected argument: ${graph.rest[0]}
${usage}` };
  }
  if (graph.graphId === void 0 || key === "") return { exitCode: 1, stderr: usage };
  const credentials = {
    key,
    graphId: graph.graphId,
    engineUrl: engine.engineUrl
  };
  const result2 = await check({
    engineUrl: credentials.engineUrl,
    token: credentials.key,
    graphId: credentials.graphId,
    paidToolsEnabled
  });
  if (!result2.ok) {
    const reason = result2.status === 0 ? `could not reach ${credentials.engineUrl}` : `the engine answered ${result2.status}`;
    return {
      exitCode: 1,
      stderr: `key not saved: ${reason}. Check the key, the graph id and the engine.
`
    };
  }
  await writeCredentials(credentialsPath2, credentials);
  return {
    exitCode: 0,
    stdout: `saved to ${credentialsPath2} (readable only by you)
session-start recall and skill matching now fetch memories themselves
`
  };
}
async function logout(credentialsPath2) {
  const removed = await removeCredentials(credentialsPath2);
  return {
    exitCode: 0,
    stdout: removed ? `removed ${credentialsPath2}
` : "no saved key\n"
  };
}

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
var LONG_LIVED_BRANCHES = /* @__PURE__ */ new Set(["main", "master", "dev", "develop", "trunk"]);
function sessionQuery(repo, branch) {
  const task = LONG_LIVED_BRANCHES.has(branch) ? "" : branch.replace(/[/_-]+/g, " ");
  return [repo, "constraints decisions conventions known fixes", task].filter(Boolean).join(" ");
}
function describeWorkspace(cwd) {
  const repo = contextSafeName(basename(git(cwd, "rev-parse", "--show-toplevel") || cwd));
  return { repo, query: sessionQuery(repo, git(cwd, "branch", "--show-current")) };
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

// cli/src/commands/skill-match.ts
var MIN_PROMPT_WORDS = 3;
async function skillMatch(input, env, match = matchSkill) {
  const prompt = (input.prompt ?? "").trim();
  if (prompt.startsWith("/")) return { exitCode: 0 };
  if (prompt.split(/\s+/).filter(Boolean).length < MIN_PROMPT_WORDS) return { exitCode: 0 };
  if (env.token === void 0 || env.graphId === void 0) return { exitCode: 0 };
  const skill = await match(env, prompt);
  if (skill === void 0) return { exitCode: 0 };
  return {
    exitCode: 0,
    stdout: `LocusGraph: the stored skill \`${skill.contextId}\` matches this request (${skill.text.trim()}). Before starting, load its steps, rules and lessons with the locusgraph-skills skill and follow them, unless the user says otherwise.
`
  };
}

// cli/src/env.ts
var trimSlash = (url) => url.replace(/\/+$/, "");
function readEnv(env, saved) {
  const engineUrl = trimSlash(env.LOCUSGRAPH_URL || DEFAULT_ENGINE_URL);
  const fromEnv = Boolean(env.LOCUSGRAPH_TOKEN || env.LOCUSGRAPH_GRAPH_ID);
  const usable = !fromEnv && saved !== void 0 && trimSlash(saved.engineUrl) === engineUrl;
  return {
    engineUrl,
    token: usable ? saved.key : env.LOCUSGRAPH_TOKEN || void 0,
    graphId: usable ? saved.graphId : env.LOCUSGRAPH_GRAPH_ID || void 0,
    paidToolsEnabled: env.LOCUSGRAPH_PAID === "1"
  };
}

// generated-rules:./generated/rules.ts
var RULES = '# LocusGraph memory\n\nLocusGraph is long-term memory that persists across sessions, projects and tools. It is\nreached through the `locusgraph` MCP server.\n\n## Recall\n\n- Before a non-trivial task, call `retrieve_memories` with the user\'s request in their own\n  words. Use `format: "toon"` and `limit: 5` unless more is needed.\n- For a question that spans linked memories ("why did we choose X?"), walk the graph yourself:\n  `list_contexts` to find the relevant `decision:` or `constraint:` ids, then\n  `retrieve_memories` with those ids in `boost_context_ids`.\n- Memories already injected at session start do not need to be fetched again.\n- Recall returns its best candidates even when none is relevant; it never answers "nothing\n  found". Read every result before answering, not only the first: the one that answers can\n  rank last. Use a memory only if it is about the question asked. If none is, say memory\n  holds nothing on it rather than stretching the closest result.\n- `match_score` mixes in the memory\'s confidence and recency, so a fresh memory scores well\n  on a weak match. When deciding whether memory answers a question at all, pass\n  `ranking: "similarity"`, which scores the match alone.\n\n## Store\n\n- Call `store_event` only for durable knowledge: a decision and its reason, a constraint, a\n  user preference or correction, a non-obvious fix.\n- Use a stable `context_id` in `type:name` form, such as `decision:use_postgres` or\n  `preference:no_code_comments`. One id holds one memory. Update it with `replace: true`.\n  Link a new detail to an existing memory with `extends`.\n- For knowledge about one repository, prefix the name with the repository\'s directory name,\n  joined by a double underscore, such as `decision:engine__use_d1_batch_only`, and add\n  `project:<repo>` to `related_to`. Session-start recall boosts `project:<repo>`, so linked\n  memories surface first.\n- Each repository has one anchor memory that owns `project:<repo>`, holding one sentence on\n  what the repository is. Without an owner, the `related_to` links to `project:<repo>` are\n  stored but never bind, so graph expansion cannot walk between that repository\'s memories.\n  Before the first repository memory in a session, call `store_event` on `project:<repo>`\n  (`event_kind: "fact"`, `source: "assistant"`) without `replace`; an answer that the id\n  already holds a memory means the anchor exists.\n- Build ids only from `a-z`, `0-9`, `_`, `-` and the one `:`. The engine lowercases an id and\n  turns any other character into `_` when it stores it, but looks ids up exactly as sent, so an\n  id with a dot or a capital is stored under one name and searched for under another. The\n  same goes for `<repo>`: `My.Repo` is `my_repo`.\n- Put one concise sentence in `payload.data`. Search matches on that text.\n- A decision or constraint states its reason in that sentence: "use `batch()` only, because\n  D1 has no interactive transactions". Without the reason, a later "why?" has nothing to\n  answer from. If the user gave none, ask for it once; store without it only if they decline.\n- Set `source: "user"` when the user said it, `"assistant"` when you inferred it.\n- Store at most a few memories per session. Never store secrets, tokens, credentials or\n  anything already recorded in the repository\'s instruction files or git history. The one\n  exception is seeding: when the user asks, `locusgraph-seed` copies rules, decisions and\n  fixes from those sources once, each approved by the user and naming its source.\n\n## Forget\n\n- Call `delete_memory` only when the user explicitly asks to forget something. Find the\n  `locus_id` with `retrieve_memories` using `format: "json"`, and confirm with the user first.\n\n## Paid tools\n\n- `observe` and `deep_recall` spend credits. Do not call them unless the user asks for them\n  by name or has enabled paid tools.\n\n## Skills\n\n- A skill is a stored working practice: `skill:<name>` with its steps (`step:<name>__<nnn>_<slug>`),\n  rules (`rule:<name>__<slug>`) and lessons (`lesson:<name>__<slug>`).\n- Before a task the user may have a practice for (deploy, release, review, migrate, a runbook),\n  call `retrieve_memories` with the request in their own words and `context_types: { "skill": [] }`.\n  If a skill fits, load its steps, rules and lessons and follow them, applying each lesson to\n  the step it links to. If none fits, carry on without one.\n- When a step fails and another action fixes it, or the user corrects a step, offer to store\n  a lesson (`event_kind: "feedback"`) that `extends` the step, or `contradicts` it if the step\n  is wrong now. Store it only on the user\'s yes.\n';

// cli/src/hook-input.ts
function parseHookInput(text) {
  try {
    const value = JSON.parse(text);
    return typeof value === "object" && value !== null ? value : {};
  } catch {
    return {};
  }
}
async function readStdin(stdin = process.stdin) {
  if (stdin.isTTY) return "";
  let text = "";
  for await (const chunk of stdin) text += chunk;
  return text;
}
async function readHookInput(stdin = process.stdin) {
  return parseHookInput(await readStdin(stdin));
}

// cli/src/main.ts
var savedPath = () => credentialsPath(process.env, homedir());
async function hookEnv() {
  return readEnv(process.env, await readCredentials(savedPath()));
}
var COMMANDS = {
  recall: async (args) => recall(await readHookInput(), await hookEnv(), {
    afterCompact: args.includes("--after-compact")
  }),
  guard: async (args) => guard(
    await readHookInput(),
    readEnv(process.env),
    args.includes("--cursor") ? "cursor" : "claude"
  ),
  "skill-match": async () => skillMatch(await readHookInput(), await hookEnv()),
  init: (args) => init(args, {
    cwd: process.cwd(),
    home: homedir(),
    rules: RULES,
    hookScript: fileURLToPath(import.meta.url)
  }),
  links: async (args) => links(args),
  login: async (args) => login(args, {
    key: (await readStdin()).trim(),
    credentialsPath: savedPath(),
    paidToolsEnabled: readEnv(process.env).paidToolsEnabled
  }),
  logout: async () => logout(savedPath())
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

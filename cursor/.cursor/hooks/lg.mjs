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
    const answer = verdict.allowed ? { permission: "allow" } : { permission: "deny", user_message: verdict.reason, agent_message: verdict.reason };
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
var configDir = ({ home, claudeConfigDir }) => claudeConfigDir ?? join(home, ".claude");
var claudeCode = {
  id: "claude-code",
  label: "Claude Code",
  writesGlobal: "~/.claude/settings.json ($CLAUDE_CONFIG_DIR if set)",
  nextStep: ({ engineUrl }) => (engineUrl === DEFAULT_ENGINE_URL ? "" : `export LOCUSGRAPH_URL=${engineUrl}, then `) + "in Claude Code: /plugin marketplace add locusgraph/plugins, then /plugin install locusgraph@locusgraph",
  detect: (context) => existsSync(configDir(context)),
  install: async (context) => {
    const settings = join(configDir(context), "settings.json");
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
import { copyFile, mkdir as mkdir2 } from "node:fs/promises";
import { join as join2 } from "node:path";
var CODEX_READ_TOOLS = ["retrieve_memories", "list_contexts"];
var HOOKS = [
  { event: "SessionStart", matcher: "startup|resume|clear", args: "recall", timeout: 10 },
  { event: "SessionStart", matcher: "compact", args: "recall --after-compact", timeout: 10 },
  { event: "UserPromptSubmit", args: "skill-match", timeout: 5 },
  {
    event: "PreToolUse",
    matcher: "mcp__locusgraph__(observe|deep_recall)",
    args: "guard",
    timeout: 5
  }
];
function withCodexHooks(script) {
  return (config) => {
    const hooks = { ...asObject(config.hooks) };
    for (const { event, matcher, args, timeout } of HOOKS) {
      const command = `node "${script}" ${args}`;
      const groups = Array.isArray(hooks[event]) ? hooks[event] : [];
      const present = groups.some((group) => {
        const entries = asObject(group).hooks;
        return Array.isArray(entries) && entries.some((hook) => asObject(hook).command === command);
      });
      if (present) continue;
      hooks[event] = [
        ...groups,
        {
          ...matcher === void 0 ? {} : { matcher },
          hooks: [{ type: "command", command, timeout }]
        }
      ];
    }
    return { ...config, hooks };
  };
}
var codex = {
  id: "codex",
  label: "Codex",
  writesGlobal: "~/.codex/config.toml and ~/.codex/hooks.json",
  nextStep: () => "codex mcp login locusgraph, then run /hooks in Codex and trust the LocusGraph hooks",
  detect: ({ home }) => existsSync2(join2(home, ".codex")),
  async install({ cwd, home, rules, mcpUrl, hookScript }) {
    const config = join2(home, ".codex/config.toml");
    await upsertTomlTable(config, "mcp_servers.locusgraph", `url = "${mcpUrl}"`);
    for (const tool of CODEX_READ_TOOLS) {
      await upsertTomlTable(
        config,
        `mcp_servers.locusgraph.tools.${tool}`,
        'approval_mode = "approve"'
      );
    }
    const script = join2(home, ".codex/locusgraph/lg.mjs");
    await mkdir2(join2(home, ".codex/locusgraph"), { recursive: true });
    await copyFile(hookScript, script);
    const hooks = join2(home, ".codex/hooks.json");
    await mergeJson(hooks, withCodexHooks(script));
    await upsertRulesBlock(join2(cwd, "AGENTS.md"), rules);
    return [config, hooks, script, "AGENTS.md"];
  }
};

// cli/src/platforms/cursor.ts
import { existsSync as existsSync3 } from "node:fs";
import { copyFile as copyFile2, mkdir as mkdir3 } from "node:fs/promises";
import { join as join3 } from "node:path";
var GUARD_COMMAND = "node .cursor/hooks/lg.mjs guard --cursor";
var RECALL_COMMAND = "node .cursor/hooks/lg.mjs recall --cursor";
var CURSOR_CLI_READ_TOOLS = [
  "Mcp(locusgraph:retrieve_memories)",
  "Mcp(locusgraph:list_contexts)"
];
function withHook(hooks, event, command) {
  const existing = Array.isArray(hooks[event]) ? hooks[event] : [];
  const present = existing.some((hook) => asObject(hook).command === command);
  return present ? existing : [...existing, { command }];
}
var cursor = {
  id: "cursor",
  label: "Cursor",
  nextStep: () => "in the Cursor IDE, allow retrieve_memories and list_contexts under Settings > Agents so recall never waits for approval",
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
    await mkdir3(join3(cwd, ".cursor/hooks"), { recursive: true });
    await copyFile2(hookScript, join3(cwd, ".cursor/hooks/lg.mjs"));
    await mergeJson(join3(cwd, ".cursor/hooks.json"), (config) => {
      const hooks = asObject(config.hooks);
      return {
        version: 1,
        ...config,
        hooks: {
          ...hooks,
          sessionStart: withHook(hooks, "sessionStart", RECALL_COMMAND),
          beforeMCPExecution: withHook(hooks, "beforeMCPExecution", GUARD_COMMAND)
        }
      };
    });
    await mergeJson(join3(cwd, ".cursor/cli.json"), (config) => {
      const permissions = asObject(config.permissions);
      const allow = Array.isArray(permissions.allow) ? permissions.allow : [];
      const missing = CURSOR_CLI_READ_TOOLS.filter((tool) => !allow.includes(tool));
      return { ...config, permissions: { ...permissions, allow: [...allow, ...missing] } };
    });
    return [
      ".cursor/mcp.json",
      ".cursor/rules/locusgraph.mdc",
      ".cursor/hooks.json",
      ".cursor/hooks/lg.mjs",
      ".cursor/cli.json"
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
function base64(text2) {
  return Buffer.from(text2, "utf8").toString("base64");
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
import { chmod, mkdir as mkdir4, readFile as readFile2, rm, writeFile as writeFile2 } from "node:fs/promises";
import { dirname as dirname2, join as join7 } from "node:path";
var NO_KEYS = { keys: [] };
var trimSlash = (url) => url.replace(/\/+$/, "");
var text = (value) => typeof value === "string" && value !== "" ? value : void 0;
function credentialsPath(env, home) {
  const base = env.XDG_CONFIG_HOME || join7(home, ".config");
  return join7(base, "locusgraph", "credentials.json");
}
function keyFrom(value) {
  if (typeof value !== "object" || value === null) return void 0;
  const entry = value;
  const key = text(entry.key);
  const engineUrl = text(entry.engine_url);
  if (key === void 0 || engineUrl === void 0) return void 0;
  const graphId = text(entry.graph_id);
  return {
    key,
    engineUrl: trimSlash(engineUrl),
    ...graphId === void 0 ? {} : { graphId }
  };
}
async function readCredentials(path) {
  let value;
  try {
    value = JSON.parse(await readFile2(path, "utf8"));
  } catch {
    return NO_KEYS;
  }
  if (!Array.isArray(value.keys)) {
    const single = keyFrom(value);
    if (single?.graphId === void 0) return NO_KEYS;
    return { keys: [single], defaultGraphId: single.graphId };
  }
  const keys = value.keys.flatMap((entry) => keyFrom(entry) ?? []);
  const defaultGraphId = text(value.default_graph_id);
  return defaultGraphId === void 0 ? { keys } : { keys, defaultGraphId };
}
async function writeCredentials(path, saved) {
  await mkdir4(dirname2(path), { recursive: true, mode: 448 });
  const body = {
    version: 2,
    ...saved.defaultGraphId === void 0 ? {} : { default_graph_id: saved.defaultGraphId },
    keys: saved.keys.map((entry) => ({
      key: entry.key,
      engine_url: entry.engineUrl,
      ...entry.graphId === void 0 ? {} : { graph_id: entry.graphId }
    }))
  };
  await writeFile2(path, `${JSON.stringify(body, null, 2)}
`, { mode: 384 });
  await chmod(path, 384);
}
var sameSlot = (a, b) => a.engineUrl === b.engineUrl && a.graphId === b.graphId;
function withKey(saved, entry, makeDefault) {
  const keys = [...saved.keys.filter((existing) => !sameSlot(existing, entry)), entry];
  const defaultGraphId = makeDefault && entry.graphId !== void 0 ? entry.graphId : saved.defaultGraphId ?? entry.graphId;
  return defaultGraphId === void 0 ? { keys } : { keys, defaultGraphId };
}
function withoutKey(saved, engineUrl, graphId) {
  const target = { key: "", engineUrl: trimSlash(engineUrl), ...graphId ? { graphId } : {} };
  const keys = saved.keys.filter((existing) => !sameSlot(existing, target));
  const defaultGraphId = saved.defaultGraphId === graphId ? void 0 : saved.defaultGraphId;
  return defaultGraphId === void 0 ? { keys } : { keys, defaultGraphId };
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
    const { context_ids: ids, text: text2, match_score: score } = item;
    if (typeof text2 !== "string" || typeof score !== "number" || !Array.isArray(ids)) continue;
    const contextId = ids.find(
      (id) => typeof id === "string" && id.startsWith("skill:")
    );
    if (contextId === void 0 || score < SKILL_MATCH_MIN_SCORE) continue;
    if (best === void 0 || score > best.score) best = { contextId, text: text2, score };
  }
  return best;
};

// cli/src/commands/login.ts
var GRAPH_FLAG = "--graph";
var ANY_FLAG = "--any";
var DEFAULT_FLAG = "--default";
var CHECK_TIMEOUT_MS = 8e3;
var checkKey = async (entry) => {
  if (entry.graphId !== void 0) {
    const result2 = await retrieve(
      {
        engineUrl: entry.engineUrl,
        token: entry.key,
        graphId: entry.graphId,
        paidToolsEnabled: false
      },
      { query: "locusgraph login check", limit: 1, format: "json" },
      CHECK_TIMEOUT_MS
    );
    return result2.ok ? { ok: true } : { ok: false, status: result2.status };
  }
  try {
    const response = await fetch(`${entry.engineUrl}/v1/graphs`, {
      headers: { authorization: `Bearer ${entry.key}` },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS)
    });
    return response.ok ? { ok: true } : { ok: false, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
};
var usage = "usage: <print your key> | lg login (--graph <graph_id> | --any) [--default] [--engine <production|dev|url>]\n  --graph <id>  a key for one graph; the first one saved becomes the default\n  --any         an account-wide key, used for any graph without its own key\n  --default     make --graph <id> the graph used where a repository names none\nThe key is read from stdin, so it stays out of your shell history. Use a key limited to memory.read.\n";
var logoutUsage = "usage: lg logout [--graph <graph_id> | --any] [--engine <production|dev|url>]\n";
function parseFlags(args) {
  const engine = takeEngineFlag(args);
  if (engine instanceof Error) return engine;
  let graphId;
  let any = false;
  let makeDefault = false;
  const rest = engine.rest;
  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index] ?? "";
    if (arg === GRAPH_FLAG || arg.startsWith(`${GRAPH_FLAG}=`)) {
      const value = arg === GRAPH_FLAG ? rest[++index] : arg.slice(GRAPH_FLAG.length + 1);
      if (value === void 0 || value === "") return new Error(`${GRAPH_FLAG} needs a value`);
      graphId = value;
    } else if (arg === ANY_FLAG) {
      any = true;
    } else if (arg === DEFAULT_FLAG) {
      makeDefault = true;
    } else {
      return new Error(`unexpected argument: ${arg}`);
    }
  }
  if (graphId !== void 0 && any)
    return new Error(`use ${GRAPH_FLAG} or ${ANY_FLAG}, not both`);
  if (makeDefault && graphId === void 0)
    return new Error(`${DEFAULT_FLAG} needs ${GRAPH_FLAG}`);
  return {
    engineUrl: engine.engineUrl,
    ...graphId === void 0 ? {} : { graphId },
    any,
    makeDefault
  };
}
async function login(args, { key, credentialsPath: credentialsPath2, check = checkKey }) {
  const flags = parseFlags(args);
  if (flags instanceof Error) return { exitCode: 1, stderr: `${flags.message}
${usage}` };
  if (flags.graphId === void 0 && !flags.any || key === "") {
    return { exitCode: 1, stderr: usage };
  }
  const entry = {
    key,
    engineUrl: flags.engineUrl,
    ...flags.graphId === void 0 ? {} : { graphId: flags.graphId }
  };
  const result2 = await check(entry);
  if (!result2.ok) {
    const reason = result2.status === 0 ? `could not reach ${entry.engineUrl}` : `the engine answered ${result2.status}`;
    return {
      exitCode: 1,
      stderr: `key not saved: ${reason}. Check the key, the graph id and the engine.
`
    };
  }
  const saved = withKey(await readCredentials(credentialsPath2), entry, flags.makeDefault);
  await writeCredentials(credentialsPath2, saved);
  const what = entry.graphId === void 0 ? "account-wide key" : `key for ${entry.graphId}`;
  const fallback = saved.defaultGraphId === void 0 ? "no default graph yet: repositories without .locusgraph.json are skipped" : `default graph: ${saved.defaultGraphId}`;
  return {
    exitCode: 0,
    stdout: `saved ${what} to ${credentialsPath2} (readable only by you)
${fallback}
`
  };
}
async function logout(args, credentialsPath2) {
  const flags = parseFlags(args);
  if (flags instanceof Error || flags.makeDefault) {
    return {
      exitCode: 1,
      stderr: `${flags instanceof Error ? `${flags.message}
` : ""}${logoutUsage}`
    };
  }
  if (flags.graphId === void 0 && !flags.any) {
    const removed = await removeCredentials(credentialsPath2);
    return { exitCode: 0, stdout: removed ? `removed ${credentialsPath2}
` : "no saved key\n" };
  }
  const saved = await readCredentials(credentialsPath2);
  const remaining = withoutKey(saved, flags.engineUrl, flags.graphId);
  const what = flags.graphId === void 0 ? "account-wide key" : `key for ${flags.graphId}`;
  if (remaining.keys.length === saved.keys.length)
    return { exitCode: 0, stdout: `no saved ${what}
` };
  await writeCredentials(credentialsPath2, remaining);
  return { exitCode: 0, stdout: `removed ${what}
` };
}

// cli/src/hook-input.ts
function hookCwd(input) {
  return input.cwd || input.workspace_roots?.[0] || process.cwd();
}
function parseHookInput(text2) {
  try {
    const value = JSON.parse(text2);
    return typeof value === "object" && value !== null ? value : {};
  } catch {
    return {};
  }
}
async function readStdin(stdin = process.stdin) {
  if (stdin.isTTY) return "";
  let text2 = "";
  for await (const chunk of stdin) text2 += chunk;
  return text2;
}
async function readHookInput(stdin = process.stdin) {
  return parseHookInput(await readStdin(stdin));
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
function repoGraphNote(env) {
  if (env.graphSource !== "repo" || env.graphId === void 0) return "";
  return `LocusGraph: this repository's graph is \`${env.graphId}\` (from .locusgraph.json). Pass \`graph_id: "${env.graphId}"\` on every LocusGraph tool call in this session. If a call is refused for this graph, the connection was approved for one other graph: tell the user to reconnect LocusGraph and choose "Every graph in this organization".`;
}
async function recall(input, env, { afterCompact, cursor: cursor2 = false, fetch: fetch2 = fetchMemories, workspace }) {
  const sections = [
    repoGraphNote(env),
    await recallSection(env, workspace ?? describeWorkspace(hookCwd(input)), fetch2),
    afterCompact ? STORE_AFTER_COMPACT : ""
  ].filter((section) => section !== "");
  const text2 = sections.join("\n\n");
  if (cursor2) {
    return {
      exitCode: 0,
      stdout: `${JSON.stringify(text2 === "" ? {} : { additional_context: text2 })}
`
    };
  }
  return text2 === "" ? { exitCode: 0 } : { exitCode: 0, stdout: `${text2}
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
var trimSlash2 = (url) => url.replace(/\/+$/, "");
function chooseGraph(env, repoGraphId, saved) {
  if (env.LOCUSGRAPH_GRAPH_ID) return { graphId: env.LOCUSGRAPH_GRAPH_ID, graphSource: "env" };
  if (repoGraphId !== void 0) return { graphId: repoGraphId, graphSource: "repo" };
  if (saved.defaultGraphId !== void 0) {
    return { graphId: saved.defaultGraphId, graphSource: "default" };
  }
  return void 0;
}
function readEnv(env, saved = NO_KEYS, repoGraphId) {
  const engineUrl = trimSlash2(env.LOCUSGRAPH_URL || DEFAULT_ENGINE_URL);
  const paidToolsEnabled = env.LOCUSGRAPH_PAID === "1";
  const graph = chooseGraph(env, repoGraphId, saved);
  const onEngine = saved.keys.filter((entry) => entry.engineUrl === engineUrl);
  const savedKey = graph === void 0 ? void 0 : onEngine.find((entry) => entry.graphId === graph.graphId) ?? onEngine.find((entry) => entry.graphId === void 0);
  return {
    engineUrl,
    token: env.LOCUSGRAPH_TOKEN || savedKey?.key,
    graphId: graph?.graphId,
    ...graph === void 0 ? {} : { graphSource: graph.graphSource },
    paidToolsEnabled
  };
}

// generated-rules:./generated/rules.ts
var RULES = '# LocusGraph memory\n\nLocusGraph is long-term memory that persists across sessions, projects and tools. It is\nreached through the `locusgraph` MCP server.\n\nIf session start names this repository\'s graph, pass that graph as `graph_id` on every\nLocusGraph tool call. Without such a note, leave `graph_id` out.\n\n## Recall\n\n- Before a non-trivial task, call `retrieve_memories` with the user\'s request in their own\n  words. Use `format: "toon"` and `limit: 5` unless more is needed.\n- For a question that spans linked memories ("why did we choose X?"), walk the graph yourself:\n  `list_contexts` to find the relevant `decision:` or `constraint:` ids, then\n  `retrieve_memories` with those ids in `boost_context_ids`.\n- Memories already injected at session start do not need to be fetched again.\n- Recall returns its best candidates even when none is relevant; it never answers "nothing\n  found". Read every result before answering, not only the first: the one that answers can\n  rank last. Use a memory only if it is about the question asked. If none is, say memory\n  holds nothing on it rather than stretching the closest result.\n- `match_score` mixes in the memory\'s confidence and recency, so a fresh memory scores well\n  on a weak match. When deciding whether memory answers a question at all, pass\n  `ranking: "similarity"`, which scores the match alone.\n\n## Store\n\n- Call `store_event` only for durable knowledge: a decision and its reason, a constraint, a\n  user preference or correction, a non-obvious fix.\n- Use a stable `context_id` in `type:name` form, such as `decision:use_postgres` or\n  `preference:no_code_comments`. One id holds one memory. Update it with `replace: true`.\n  Link a new detail to an existing memory with `extends`.\n- For knowledge about one repository, prefix the name with the repository\'s directory name,\n  joined by a double underscore, such as `decision:engine__use_d1_batch_only`, and add\n  `project:<repo>` to `related_to`. Session-start recall boosts `project:<repo>`, so linked\n  memories surface first.\n- Each repository has one anchor memory that owns `project:<repo>`, holding one sentence on\n  what the repository is. Without an owner, the `related_to` links to `project:<repo>` are\n  stored but never bind, so graph expansion cannot walk between that repository\'s memories.\n  Before the first repository memory in a session, call `store_event` on `project:<repo>`\n  (`event_kind: "fact"`, `source: "assistant"`) without `replace`; an answer that the id\n  already holds a memory means the anchor exists.\n- Build ids only from `a-z`, `0-9`, `_`, `-` and the one `:`. The engine lowercases an id and\n  turns any other character into `_` when it stores it, but looks ids up exactly as sent, so an\n  id with a dot or a capital is stored under one name and searched for under another. The\n  same goes for `<repo>`: `My.Repo` is `my_repo`.\n- Put one concise sentence in `payload.data`. Search matches on that text.\n- A decision or constraint states its reason in that sentence: "use `batch()` only, because\n  D1 has no interactive transactions". Without the reason, a later "why?" has nothing to\n  answer from. If the user gave none, ask for it once; store without it only if they decline.\n- Set `source: "user"` when the user said it, `"assistant"` when you inferred it.\n- Store at most a few memories per session. Never store secrets, tokens, credentials or\n  anything already recorded in the repository\'s instruction files or git history. The one\n  exception is seeding: when the user asks, `locusgraph-seed` copies rules, decisions and\n  fixes from those sources once, each approved by the user and naming its source.\n\n## Forget\n\n- Call `delete_memory` only when the user explicitly asks to forget something. Find the\n  `locus_id` with `retrieve_memories` using `format: "json"`, and confirm with the user first.\n\n## Paid tools\n\n- `observe` and `deep_recall` spend credits. Do not call them unless the user asks for them\n  by name or has enabled paid tools.\n\n## Skills\n\n- A skill is a stored working practice: `skill:<name>` with its steps (`step:<name>__<nnn>_<slug>`),\n  rules (`rule:<name>__<slug>`) and lessons (`lesson:<name>__<slug>`).\n- Before a task the user may have a practice for (deploy, release, review, migrate, a runbook),\n  call `retrieve_memories` with the request in their own words and `context_types: { "skill": [] }`.\n  If a skill fits, load its steps, rules and lessons and follow them, applying each lesson to\n  the step it links to. If none fits, carry on without one.\n- When a step fails and another action fixes it, or the user corrects a step, offer to store\n  a lesson (`event_kind: "feedback"`) that `extends` the step, or `contradicts` it if the step\n  is wrong now. Store it only on the user\'s yes.\n';

// cli/src/repo-graph.ts
import { execFileSync as execFileSync2 } from "node:child_process";
import { readFileSync } from "node:fs";
import { join as join8 } from "node:path";
var REPO_GRAPH_FILE = ".locusgraph.json";
var GRAPH_ID = /^[A-Za-z0-9_-]{1,128}$/;
function gitRoot(cwd) {
  try {
    const root = execFileSync2("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return root === "" ? void 0 : root;
  } catch {
    return void 0;
  }
}
function readRepoGraph(cwd) {
  const root = gitRoot(cwd);
  if (root === void 0) return void 0;
  try {
    const value = JSON.parse(readFileSync(join8(root, REPO_GRAPH_FILE), "utf8"));
    const graphId = typeof value === "object" && value !== null ? value.graph_id : void 0;
    return typeof graphId === "string" && GRAPH_ID.test(graphId) ? graphId : void 0;
  } catch {
    return void 0;
  }
}

// cli/src/main.ts
var savedPath = () => credentialsPath(process.env, homedir());
async function hookEnv(input) {
  return readEnv(
    process.env,
    await readCredentials(savedPath()),
    readRepoGraph(hookCwd(input))
  );
}
var COMMANDS = {
  recall: async (args) => {
    const input = await readHookInput();
    return recall(input, await hookEnv(input), {
      afterCompact: args.includes("--after-compact"),
      cursor: args.includes("--cursor")
    });
  },
  guard: async (args) => guard(
    await readHookInput(),
    readEnv(process.env),
    args.includes("--cursor") ? "cursor" : "claude"
  ),
  "skill-match": async () => {
    const input = await readHookInput();
    return skillMatch(input, await hookEnv(input));
  },
  init: (args) => init(args, {
    cwd: process.cwd(),
    home: homedir(),
    rules: RULES,
    hookScript: fileURLToPath(import.meta.url),
    ...process.env.CLAUDE_CONFIG_DIR ? { claudeConfigDir: process.env.CLAUDE_CONFIG_DIR } : {}
  }),
  links: async (args) => links(args),
  login: async (args) => login(args, { key: (await readStdin()).trim(), credentialsPath: savedPath() }),
  logout: async (args) => logout(args, savedPath())
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

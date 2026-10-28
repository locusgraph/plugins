#!/usr/bin/env node

// cli/src/main.ts
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

// cli/src/config.ts
var DEFAULT_ENGINE_URL = "https://api.locusgraph.com";
var MCP_URL = `${DEFAULT_ENGINE_URL}/mcp?tools=free`;
var PAID_TOOLS = ["observe", "deep_recall"];

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
  nextStep: "in Claude Code: /plugin marketplace add locusgraph/plugins, then /plugin install locusgraph@locusgraph",
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
async function appendTomlTable(path, table, body) {
  const current = await readText(path) ?? "";
  if (current.includes(`[${table}]`)) return;
  const separated = current === "" ? "" : current.replace(/\n*$/, "\n\n");
  await writeText(path, `${separated}[${table}]
${body}
`);
}

// cli/src/platforms/codex.ts
var codex = {
  id: "codex",
  label: "Codex",
  writesGlobal: "~/.codex/config.toml",
  nextStep: "codex mcp login locusgraph",
  detect: ({ home }) => existsSync2(join2(home, ".codex")),
  async install({ cwd, home, rules }) {
    const config = join2(home, ".codex/config.toml");
    await appendTomlTable(config, "mcp_servers.locusgraph", `url = "${MCP_URL}"`);
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
  async install({ cwd, rules, hookScript }) {
    await mergeJson(
      join3(cwd, ".cursor/mcp.json"),
      withLocusGraphServer("mcpServers", { url: MCP_URL })
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
  async install({ cwd, rules }) {
    await mergeJson(
      join4(cwd, ".gemini/settings.json"),
      withLocusGraphServer("mcpServers", { httpUrl: MCP_URL, excludeTools: [...PAID_TOOLS] })
    );
    await upsertRulesBlock(join4(cwd, "GEMINI.md"), rules);
    return [".gemini/settings.json", "GEMINI.md"];
  }
};

// cli/src/platforms/opencode.ts
import { existsSync as existsSync5 } from "node:fs";
import { join as join5 } from "node:path";
var addServer = withLocusGraphServer("mcp", { type: "remote", url: MCP_URL, enabled: true });
var opencode = {
  id: "opencode",
  label: "OpenCode",
  detect: ({ cwd, home }) => existsSync5(join5(cwd, "opencode.json")) || existsSync5(join5(home, ".config/opencode")),
  async install({ cwd, rules }) {
    await mergeJson(join5(cwd, "opencode.json"), (config) => ({
      $schema: "https://opencode.ai/config.json",
      ...addServer(config)
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
  async install({ cwd, rules }) {
    await mergeJson(
      join6(cwd, ".vscode/mcp.json"),
      withLocusGraphServer("servers", { type: "http", url: MCP_URL })
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

// cli/src/commands/init.ts
var CONFIRM_FLAG = "--yes";
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
      if (platform.nextStep !== void 0) lines.push(`  next: ${platform.nextStep}`);
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
async function init(args, context) {
  const confirmed = args.includes(CONFIRM_FLAG);
  const named = args.filter((arg) => arg !== CONFIRM_FLAG);
  const unknown = named.filter((id) => findPlatform(id) === void 0);
  if (unknown.length > 0) {
    return output(1, [
      `unknown platform: ${unknown.join(", ")}. Choose from: ${PLATFORM_IDS.join(", ")}`
    ]);
  }
  const chosen = named.length > 0 ? named.flatMap((id) => findPlatform(id) ?? []) : PLATFORMS.filter((platform) => platform.detect(context));
  if (chosen.length === 0) {
    return output(1, [
      `no supported agent found here. Name one: lg init <${PLATFORM_IDS.join("|")}>`
    ]);
  }
  if (named.length === 0 && !confirmed) return output(0, describePlan(chosen));
  const { lines, failed } = await installAll(chosen, context);
  return output(failed ? 1 : 0, lines);
}

// cli/src/engine.ts
var RECALL_LIMIT = 6;
var RECALL_TIMEOUT_MS = 4e3;
var fetchMemories = async (env, { repo, query }) => {
  if (env.token === void 0 || env.graphId === void 0) return "";
  try {
    const response = await fetch(`${env.engineUrl}/v1/memories`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.token}`, "content-type": "application/json" },
      body: JSON.stringify({
        graph_id: env.graphId,
        query,
        limit: RECALL_LIMIT,
        format: "toon",
        boost_context_ids: [`project:${repo}`, `handoff:${repo}`]
      }),
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
function describeWorkspace(cwd) {
  const repo = basename(git(cwd, "rev-parse", "--show-toplevel") || cwd);
  const branch = git(cwd, "branch", "--show-current");
  const recentSubjects = git(cwd, "log", "-5", "--format=%s");
  return { repo, query: [repo, branch, recentSubjects].filter(Boolean).join("\n") };
}

// cli/src/commands/recall.ts
var STORE_AFTER_COMPACT = "LocusGraph: the conversation was just compacted. Before continuing, store at most 3 durable decisions, constraints or user corrections from the summary above with `store_event` (source: user or assistant, a stable `type:name` context_id). Skip anything already in CLAUDE.md, AGENTS.md or git history. If nothing qualifies, store nothing.";
async function recall(input, env, { afterCompact, fetch: fetch2 = fetchMemories }) {
  const memories = await fetch2(env, describeWorkspace(input.cwd || process.cwd()));
  const sections = [];
  if (memories !== "") sections.push(`LocusGraph memories for this workspace:
${memories}`);
  if (afterCompact) sections.push(STORE_AFTER_COMPACT);
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
var RULES = '# LocusGraph memory\n\nLocusGraph is long-term memory that persists across sessions, projects and tools. It is\nreached through the `locusgraph` MCP server.\n\n## Recall\n\n- Before a non-trivial task, call `retrieve_memories` with the user\'s request in their own\n  words. Use `format: "toon"` and `limit: 5` unless more is needed.\n- For a question that spans linked memories ("why did we choose X?"), walk the graph yourself:\n  `list_contexts` to find the relevant `decision:` or `constraint:` ids, then\n  `retrieve_memories` with those ids in `boost_context_ids`.\n- Memories already injected at session start do not need to be fetched again.\n\n## Store\n\n- Call `store_event` only for durable knowledge: a decision and its reason, a constraint, a\n  user preference or correction, a non-obvious fix.\n- Use a stable `context_id` in `type:name` form, such as `decision:use_postgres` or\n  `preference:no_code_comments`. One id holds one memory. Update it with `replace: true`.\n  Link a new detail to an existing memory with `extends`.\n- For knowledge about one repository, prefix the name with the repository\'s directory name,\n  such as `decision:engine.use_d1_batch_only`, and add `project:<repo>` to `related_to`.\n  Session-start recall boosts `project:<repo>`, so linked memories surface first.\n- Put one concise sentence in `payload.data`. Search matches on that text.\n- Set `source: "user"` when the user said it, `"assistant"` when you inferred it.\n- Store at most a few memories per session. Never store secrets, tokens, credentials or\n  anything already recorded in the repository\'s instruction files or git history.\n\n## Forget\n\n- Call `delete_memory` only when the user explicitly asks to forget something. Find the\n  `locus_id` with `retrieve_memories` using `format: "json"`, and confirm with the user first.\n\n## Paid tools\n\n- `observe` and `deep_recall` spend credits. Do not call them unless the user asks for them\n  by name or has enabled paid tools.\n';

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
  })
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

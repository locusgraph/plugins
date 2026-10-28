import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const MCP_URL = "https://api.locusgraph.com/mcp?tools=free";
const RULES_START = "<!-- locusgraph:start -->";
const RULES_END = "<!-- locusgraph:end -->";
const CURSOR_GUARD = "node .cursor/hooks/lg.mjs guard --cursor";

async function readText(path) {
  return readFile(path, "utf8").catch(() => null);
}

async function writeText(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

export async function mergeJson(path, merge) {
  const current = await readText(path);
  let parsed = {};
  if (current !== null && current.trim() !== "") {
    try {
      parsed = JSON.parse(current);
    } catch {
      throw new Error(`${path} is not plain JSON; add the locusgraph entry by hand`);
    }
  }
  await writeText(path, `${JSON.stringify(merge(parsed), null, 2)}\n`);
}

export async function upsertRulesBlock(path, rules) {
  const block = `${RULES_START}\n${rules.trim()}\n${RULES_END}\n`;
  const current = (await readText(path)) ?? "";
  const start = current.indexOf(RULES_START);
  const end = current.indexOf(RULES_END);
  const next =
    start !== -1 && end > start
      ? current.slice(0, start) + block + current.slice(end + RULES_END.length).replace(/^\n/, "")
      : current === ""
        ? block
        : `${current.replace(/\n*$/, "\n\n")}${block}`;
  await writeText(path, next);
}

export async function upsertTomlTable(path, table, body) {
  const current = (await readText(path)) ?? "";
  if (current.includes(`[${table}]`)) return false;
  await writeText(path, `${current.replace(/\n*$/, current === "" ? "" : "\n\n")}[${table}]\n${body}\n`);
  return true;
}

function withServer(key, entry) {
  return (config) => ({ ...config, [key]: { ...config[key], locusgraph: entry } });
}

export const PLATFORMS = {
  cursor: {
    label: "Cursor",
    detect: ({ cwd }) => existsSync(join(cwd, ".cursor")),
    install: async ({ cwd, rules }) => {
      await mergeJson(join(cwd, ".cursor/mcp.json"), withServer("mcpServers", { url: MCP_URL }));
      await writeText(
        join(cwd, ".cursor/rules/locusgraph.mdc"),
        `---\ndescription: LocusGraph long-term memory\nalwaysApply: true\n---\n\n${rules}`,
      );
      await mkdir(join(cwd, ".cursor/hooks"), { recursive: true });
      await copyFile(join(here, "lg.mjs"), join(cwd, ".cursor/hooks/lg.mjs"));
      await mergeJson(join(cwd, ".cursor/hooks.json"), (config) => {
        const existing = config.hooks?.beforeMCPExecution ?? [];
        const guarded = existing.some((hook) => hook.command === CURSOR_GUARD);
        return {
          version: 1,
          ...config,
          hooks: {
            ...config.hooks,
            beforeMCPExecution: guarded ? existing : [...existing, { command: CURSOR_GUARD }],
          },
        };
      });
      return [".cursor/mcp.json", ".cursor/rules/locusgraph.mdc", ".cursor/hooks.json", ".cursor/hooks/lg.mjs"];
    },
  },
  codex: {
    label: "Codex",
    detect: ({ home }) => existsSync(join(home, ".codex")),
    install: async ({ cwd, home, rules }) => {
      const config = join(home, ".codex/config.toml");
      await upsertTomlTable(config, "mcp_servers.locusgraph", `url = "${MCP_URL}"`);
      await upsertRulesBlock(join(cwd, "AGENTS.md"), rules);
      return [config, "AGENTS.md"];
    },
    next: "codex mcp login locusgraph",
  },
  opencode: {
    label: "OpenCode",
    detect: ({ cwd, home }) =>
      existsSync(join(cwd, "opencode.json")) || existsSync(join(home, ".config/opencode")),
    install: async ({ cwd, rules }) => {
      await mergeJson(join(cwd, "opencode.json"), (config) => ({
        $schema: "https://opencode.ai/config.json",
        ...withServer("mcp", { type: "remote", url: MCP_URL, enabled: true })(config),
      }));
      await upsertRulesBlock(join(cwd, "AGENTS.md"), rules);
      return ["opencode.json", "AGENTS.md"];
    },
  },
  gemini: {
    label: "Gemini CLI",
    detect: ({ cwd, home }) => existsSync(join(cwd, ".gemini")) || existsSync(join(home, ".gemini")),
    install: async ({ cwd, rules }) => {
      await mergeJson(
        join(cwd, ".gemini/settings.json"),
        withServer("mcpServers", { httpUrl: MCP_URL, excludeTools: ["observe", "deep_recall"] }),
      );
      await upsertRulesBlock(join(cwd, "GEMINI.md"), rules);
      return [".gemini/settings.json", "GEMINI.md"];
    },
  },
  vscode: {
    label: "VS Code Copilot",
    detect: ({ cwd }) => existsSync(join(cwd, ".vscode")),
    install: async ({ cwd, rules }) => {
      await mergeJson(join(cwd, ".vscode/mcp.json"), withServer("servers", { type: "http", url: MCP_URL }));
      await upsertRulesBlock(join(cwd, ".github/copilot-instructions.md"), rules);
      return [".vscode/mcp.json", ".github/copilot-instructions.md"];
    },
  },
  "claude-code": {
    label: "Claude Code",
    detect: ({ home }) => existsSync(join(home, ".claude")),
    install: async () => [],
    next: "in Claude Code: /plugin marketplace add locusgraph/plugins, then /plugin install locusgraph@locusgraph",
  },
};

function display(path, cwd, home) {
  if (!path.startsWith("/")) return path;
  if (path.startsWith(cwd)) return relative(cwd, path);
  return path.startsWith(home) ? `~/${relative(home, path)}` : path;
}

export async function init(args, { cwd = process.cwd(), home = homedir(), out = console.log } = {}) {
  const unknown = args.filter((name) => !(name in PLATFORMS));
  if (unknown.length > 0) {
    out(`unknown platform: ${unknown.join(", ")}. Choose from: ${Object.keys(PLATFORMS).join(", ")}`);
    return 1;
  }

  const context = { cwd, home, rules: await readFile(join(here, "rules.md"), "utf8") };
  const chosen = args.length > 0 ? args : Object.keys(PLATFORMS).filter((name) => PLATFORMS[name].detect(context));
  if (chosen.length === 0) {
    out(`no supported agent found here. Name one: lg init <${Object.keys(PLATFORMS).join("|")}>`);
    return 1;
  }

  let failed = false;
  for (const name of chosen) {
    const platform = PLATFORMS[name];
    try {
      const written = await platform.install(context);
      out(`✔ ${platform.label}${written.length > 0 ? `: ${written.map((path) => display(path, cwd, home)).join(", ")}` : ""}`);
      if (platform.next !== undefined) out(`  next: ${platform.next}`);
    } catch (error) {
      failed = true;
      out(`✘ ${platform.label}: ${error.message}`);
    }
  }
  out("→ the first LocusGraph tool call opens the browser to sign in");
  return failed ? 1 : 0;
}

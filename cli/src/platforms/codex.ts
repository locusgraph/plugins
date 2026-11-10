import { existsSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  asObject,
  type JsonObject,
  mergeJson,
  upsertRulesBlock,
  upsertTomlTable,
} from "../files.ts";
import type { Platform } from "./platform.ts";

// Read-only tools that never ask for approval. store_event and delete_memory keep Codex's
// default, which asks for a tool that is not read-only.
export const CODEX_READ_TOOLS = ["retrieve_memories", "list_contexts"] as const;

interface CodexHook {
  readonly event: string;
  readonly matcher?: string;
  readonly args: string;
  readonly timeout: number;
}

// Codex adds plain stdout from SessionStart and UserPromptSubmit to the model's context, and a
// PreToolUse hook blocks with exit code 2, so the hook speaks the same dialect as Claude Code.
const HOOKS: readonly CodexHook[] = [
  { event: "SessionStart", matcher: "startup|resume|clear", args: "recall", timeout: 10 },
  { event: "SessionStart", matcher: "compact", args: "recall --after-compact", timeout: 10 },
  { event: "UserPromptSubmit", args: "skill-match", timeout: 5 },
  {
    event: "PreToolUse",
    matcher: "mcp__locusgraph__(observe|deep_recall)",
    args: "guard",
    timeout: 5,
  },
];

function withCodexHooks(script: string) {
  return (config: JsonObject): JsonObject => {
    const hooks = { ...asObject(config.hooks) };
    for (const { event, matcher, args, timeout } of HOOKS) {
      const command = `node "${script}" ${args}`;
      const groups = Array.isArray(hooks[event]) ? (hooks[event] as unknown[]) : [];
      const present = groups.some((group) => {
        const entries = asObject(group).hooks;
        return (
          Array.isArray(entries) && entries.some((hook) => asObject(hook).command === command)
        );
      });
      if (present) continue;
      hooks[event] = [
        ...groups,
        {
          ...(matcher === undefined ? {} : { matcher }),
          hooks: [{ type: "command", command, timeout }],
        },
      ];
    }
    return { ...config, hooks };
  };
}

export const codex: Platform = {
  id: "codex",
  label: "Codex",
  writesGlobal: "~/.codex/config.toml and ~/.codex/hooks.json",
  nextStep: () =>
    "codex mcp login locusgraph, then run /hooks in Codex and trust the LocusGraph hooks",
  detect: ({ home }) => existsSync(join(home, ".codex")),
  async install({ cwd, home, rules, mcpUrl, hookScript }) {
    const config = join(home, ".codex/config.toml");
    await upsertTomlTable(config, "mcp_servers.locusgraph", `url = "${mcpUrl}"`);
    for (const tool of CODEX_READ_TOOLS) {
      await upsertTomlTable(
        config,
        `mcp_servers.locusgraph.tools.${tool}`,
        'approval_mode = "approve"',
      );
    }

    const script = join(home, ".codex/locusgraph/lg.mjs");
    await mkdir(join(home, ".codex/locusgraph"), { recursive: true });
    await copyFile(hookScript, script);
    const hooks = join(home, ".codex/hooks.json");
    await mergeJson(hooks, withCodexHooks(script));

    await upsertRulesBlock(join(cwd, "AGENTS.md"), rules);
    return [config, hooks, script, "AGENTS.md"];
  },
};

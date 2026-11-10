import { existsSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  asObject,
  type JsonObject,
  mergeJson,
  withLocusGraphServer,
  writeText,
} from "../files.ts";
import type { Platform } from "./platform.ts";

// Project hooks run from the project root, so the script path is relative to it.
const GUARD_COMMAND = "node .cursor/hooks/lg.mjs guard --cursor";
const RECALL_COMMAND = "node .cursor/hooks/lg.mjs recall --cursor";

// cursor-agent (the CLI) reads per-tool permissions from .cursor/cli.json. The IDE has no file
// setting for this: its MCP allowlist lives in Settings > Agents.
export const CURSOR_CLI_READ_TOOLS = [
  "Mcp(locusgraph:retrieve_memories)",
  "Mcp(locusgraph:list_contexts)",
] as const;

function withHook(hooks: JsonObject, event: string, command: string): unknown[] {
  const existing = Array.isArray(hooks[event]) ? (hooks[event] as unknown[]) : [];
  const present = existing.some((hook) => asObject(hook).command === command);
  return present ? existing : [...existing, { command }];
}

export const cursor: Platform = {
  id: "cursor",
  label: "Cursor",
  nextStep: () =>
    "in the Cursor IDE, allow retrieve_memories and list_contexts under Settings > Agents so recall never waits for approval",
  detect: ({ cwd }) => existsSync(join(cwd, ".cursor")),
  async install({ cwd, rules, hookScript, mcpUrl }) {
    await mergeJson(
      join(cwd, ".cursor/mcp.json"),
      withLocusGraphServer("mcpServers", { url: mcpUrl }),
    );
    await writeText(
      join(cwd, ".cursor/rules/locusgraph.mdc"),
      `---\ndescription: LocusGraph long-term memory\nalwaysApply: true\n---\n\n${rules}`,
    );
    await mkdir(join(cwd, ".cursor/hooks"), { recursive: true });
    await copyFile(hookScript, join(cwd, ".cursor/hooks/lg.mjs"));
    await mergeJson(join(cwd, ".cursor/hooks.json"), (config) => {
      const hooks = asObject(config.hooks);
      return {
        version: 1,
        ...config,
        hooks: {
          ...hooks,
          sessionStart: withHook(hooks, "sessionStart", RECALL_COMMAND),
          beforeMCPExecution: withHook(hooks, "beforeMCPExecution", GUARD_COMMAND),
        },
      };
    });
    await mergeJson(join(cwd, ".cursor/cli.json"), (config) => {
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
      ".cursor/cli.json",
    ];
  },
};

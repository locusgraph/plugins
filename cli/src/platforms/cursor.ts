import { existsSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { asObject, mergeJson, withLocusGraphServer, writeText } from "../files.ts";
import type { Platform } from "./platform.ts";

const GUARD_COMMAND = "node .cursor/hooks/lg.mjs guard --cursor";

export const cursor: Platform = {
  id: "cursor",
  label: "Cursor",
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
      const existing = Array.isArray(hooks.beforeMCPExecution) ? hooks.beforeMCPExecution : [];
      const guarded = existing.some((hook) => asObject(hook).command === GUARD_COMMAND);
      return {
        version: 1,
        ...config,
        hooks: {
          ...hooks,
          beforeMCPExecution: guarded ? existing : [...existing, { command: GUARD_COMMAND }],
        },
      };
    });
    return [
      ".cursor/mcp.json",
      ".cursor/rules/locusgraph.mdc",
      ".cursor/hooks.json",
      ".cursor/hooks/lg.mjs",
    ];
  },
};

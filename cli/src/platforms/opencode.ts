import { existsSync } from "node:fs";
import { join } from "node:path";
import { MCP_URL } from "../config.ts";
import { mergeJson, upsertRulesBlock, withLocusGraphServer } from "../files.ts";
import type { Platform } from "./platform.ts";

const addServer = withLocusGraphServer("mcp", { type: "remote", url: MCP_URL, enabled: true });

export const opencode: Platform = {
  id: "opencode",
  label: "OpenCode",
  detect: ({ cwd, home }) =>
    existsSync(join(cwd, "opencode.json")) || existsSync(join(home, ".config/opencode")),
  async install({ cwd, rules }) {
    await mergeJson(join(cwd, "opencode.json"), (config) => ({
      $schema: "https://opencode.ai/config.json",
      ...addServer(config),
    }));
    await upsertRulesBlock(join(cwd, "AGENTS.md"), rules);
    return ["opencode.json", "AGENTS.md"];
  },
};

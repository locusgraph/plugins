import { existsSync } from "node:fs";
import { join } from "node:path";
import { mergeJson, upsertRulesBlock, withLocusGraphServer } from "../files.ts";
import type { Platform } from "./platform.ts";

export const opencode: Platform = {
  id: "opencode",
  label: "OpenCode",
  detect: ({ cwd, home }) =>
    existsSync(join(cwd, "opencode.json")) || existsSync(join(home, ".config/opencode")),
  async install({ cwd, rules, mcpUrl }) {
    await mergeJson(join(cwd, "opencode.json"), (config) => ({
      $schema: "https://opencode.ai/config.json",
      ...withLocusGraphServer("mcp", { type: "remote", url: mcpUrl, enabled: true })(config),
    }));
    await upsertRulesBlock(join(cwd, "AGENTS.md"), rules);
    return ["opencode.json", "AGENTS.md"];
  },
};

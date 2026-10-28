import { existsSync } from "node:fs";
import { join } from "node:path";
import { MCP_URL, PAID_TOOLS } from "../config.ts";
import { mergeJson, upsertRulesBlock, withLocusGraphServer } from "../files.ts";
import type { Platform } from "./platform.ts";

export const gemini: Platform = {
  id: "gemini",
  label: "Gemini CLI",
  detect: ({ cwd, home }) =>
    existsSync(join(cwd, ".gemini")) || existsSync(join(home, ".gemini")),
  async install({ cwd, rules }) {
    await mergeJson(
      join(cwd, ".gemini/settings.json"),
      withLocusGraphServer("mcpServers", { httpUrl: MCP_URL, excludeTools: [...PAID_TOOLS] }),
    );
    await upsertRulesBlock(join(cwd, "GEMINI.md"), rules);
    return [".gemini/settings.json", "GEMINI.md"];
  },
};

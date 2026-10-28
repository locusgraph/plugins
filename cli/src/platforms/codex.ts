import { existsSync } from "node:fs";
import { join } from "node:path";
import { MCP_URL } from "../config.ts";
import { appendTomlTable, upsertRulesBlock } from "../files.ts";
import type { Platform } from "./platform.ts";

export const codex: Platform = {
  id: "codex",
  label: "Codex",
  writesGlobal: "~/.codex/config.toml",
  nextStep: "codex mcp login locusgraph",
  detect: ({ home }) => existsSync(join(home, ".codex")),
  async install({ cwd, home, rules }) {
    const config = join(home, ".codex/config.toml");
    await appendTomlTable(config, "mcp_servers.locusgraph", `url = "${MCP_URL}"`);
    await upsertRulesBlock(join(cwd, "AGENTS.md"), rules);
    return [config, "AGENTS.md"];
  },
};

import { existsSync } from "node:fs";
import { join } from "node:path";
import { mergeJson, upsertRulesBlock, withLocusGraphServer } from "../files.ts";
import type { Platform } from "./platform.ts";

export const vscode: Platform = {
  id: "vscode",
  label: "VS Code Copilot",
  detect: ({ cwd }) => existsSync(join(cwd, ".vscode")),
  async install({ cwd, rules, mcpUrl }) {
    await mergeJson(
      join(cwd, ".vscode/mcp.json"),
      withLocusGraphServer("servers", { type: "http", url: mcpUrl }),
    );
    await upsertRulesBlock(join(cwd, ".github/copilot-instructions.md"), rules);
    return [".vscode/mcp.json", ".github/copilot-instructions.md"];
  },
};

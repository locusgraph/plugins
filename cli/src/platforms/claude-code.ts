import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Platform } from "./platform.ts";

export const claudeCode: Platform = {
  id: "claude-code",
  label: "Claude Code",
  nextStep:
    "in Claude Code: /plugin marketplace add locusgraph/plugins, then /plugin install locusgraph@locusgraph",
  detect: ({ home }) => existsSync(join(home, ".claude")),
  install: async () => [],
};

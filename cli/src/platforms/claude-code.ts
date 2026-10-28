import { existsSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_ENGINE_URL } from "../config.ts";
import type { Platform } from "./platform.ts";

export const claudeCode: Platform = {
  id: "claude-code",
  label: "Claude Code",
  nextStep: ({ engineUrl }) =>
    (engineUrl === DEFAULT_ENGINE_URL ? "" : `export LOCUSGRAPH_URL=${engineUrl}, then `) +
    "in Claude Code: /plugin marketplace add locusgraph/plugins, then /plugin install locusgraph@locusgraph",
  detect: ({ home }) => existsSync(join(home, ".claude")),
  install: async () => [],
};

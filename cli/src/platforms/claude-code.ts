import { existsSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_ENGINE_URL } from "../config.ts";
import { asObject, mergeJson } from "../files.ts";
import type { InstallContext, Platform } from "./platform.ts";

// The plugin's read-only tools, allowed without a prompt so recall is never stopped by a
// permission dialog. store_event and delete_memory keep asking: writes stay approved by a person.
export const CLAUDE_CODE_READ_TOOLS = [
  "mcp__plugin_locusgraph_locusgraph__retrieve_memories",
  "mcp__plugin_locusgraph_locusgraph__list_contexts",
] as const;

const configDir = ({ home, claudeConfigDir }: InstallContext) =>
  claudeConfigDir ?? join(home, ".claude");

export const claudeCode: Platform = {
  id: "claude-code",
  label: "Claude Code",
  writesGlobal: "~/.claude/settings.json ($CLAUDE_CONFIG_DIR if set)",
  nextStep: ({ engineUrl }) =>
    (engineUrl === DEFAULT_ENGINE_URL ? "" : `export LOCUSGRAPH_URL=${engineUrl}, then `) +
    "in Claude Code: /plugin marketplace add locusgraph/plugins, then /plugin install locusgraph@locusgraph",
  detect: (context) => existsSync(configDir(context)),
  install: async (context) => {
    const settings = join(configDir(context), "settings.json");
    await mergeJson(settings, (config) => {
      const permissions = asObject(config.permissions);
      const allow = Array.isArray(permissions.allow) ? permissions.allow : [];
      const missing = CLAUDE_CODE_READ_TOOLS.filter((tool) => !allow.includes(tool));
      return { ...config, permissions: { ...permissions, allow: [...allow, ...missing] } };
    });
    return [settings];
  },
};

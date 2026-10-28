import { PAID_TOOLS } from "./config.ts";

const PAID_TOOL_NAME = new RegExp(`(^|__)(${PAID_TOOLS.join("|")})$`);

export type Verdict =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string };

export function judgeToolCall(toolName: string, paidToolsEnabled: boolean): Verdict {
  if (paidToolsEnabled || !PAID_TOOL_NAME.test(toolName)) return { allowed: true };
  return {
    allowed: false,
    reason:
      `${toolName} spends LocusGraph credits and is disabled. ` +
      "Use retrieve_memories (free) instead, or set LOCUSGRAPH_PAID=1 to enable paid tools.",
  };
}

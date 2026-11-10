import type { LocusGraphEnv } from "../env.ts";
import type { HookInput } from "../hook-input.ts";
import { judgeToolCall } from "../paid-tools.ts";
import type { CommandResult } from "./result.ts";

export type HookDialect = "claude" | "cursor";

export function guard(
  input: HookInput,
  env: LocusGraphEnv,
  dialect: HookDialect,
): CommandResult {
  const verdict = judgeToolCall(
    String(input.tool_name ?? input.toolName ?? ""),
    env.paidToolsEnabled,
  );

  if (dialect === "cursor") {
    const answer = verdict.allowed
      ? { permission: "allow" }
      : { permission: "deny", user_message: verdict.reason, agent_message: verdict.reason };
    return { exitCode: 0, stdout: JSON.stringify(answer) };
  }

  return verdict.allowed ? { exitCode: 0 } : { exitCode: 2, stderr: `${verdict.reason}\n` };
}

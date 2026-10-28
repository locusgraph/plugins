import { type FetchMemories, fetchMemories } from "../engine.ts";
import type { LocusGraphEnv } from "../env.ts";
import type { HookInput } from "../hook-input.ts";
import { describeWorkspace } from "../workspace.ts";
import type { CommandResult } from "./result.ts";

export const STORE_AFTER_COMPACT =
  "LocusGraph: the conversation was just compacted. Before continuing, store at most 3 durable " +
  "decisions, constraints or user corrections from the summary above with `store_event` " +
  "(source: user or assistant, a stable `type:name` context_id). Skip anything already in " +
  "CLAUDE.md, AGENTS.md or git history. If nothing qualifies, store nothing.";

export interface RecallOptions {
  readonly afterCompact: boolean;
  readonly fetch?: FetchMemories;
}

export async function recall(
  input: HookInput,
  env: LocusGraphEnv,
  { afterCompact, fetch = fetchMemories }: RecallOptions,
): Promise<CommandResult> {
  const memories = await fetch(env, describeWorkspace(input.cwd || process.cwd()));
  const sections: string[] = [];
  if (memories !== "") sections.push(`LocusGraph memories for this workspace:\n${memories}`);
  if (afterCompact) sections.push(STORE_AFTER_COMPACT);
  return sections.length === 0
    ? { exitCode: 0 }
    : { exitCode: 0, stdout: `${sections.join("\n\n")}\n` };
}

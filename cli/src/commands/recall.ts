import { type FetchMemories, fetchMemories } from "../engine.ts";
import type { LocusGraphEnv } from "../env.ts";
import type { HookInput } from "../hook-input.ts";
import { recallArguments } from "../recall-query.ts";
import { describeWorkspace, type Workspace } from "../workspace.ts";
import type { CommandResult } from "./result.ts";

export const STORE_AFTER_COMPACT =
  "LocusGraph: the conversation was just compacted. Before continuing, store at most 3 durable " +
  "decisions, constraints or user corrections from the summary above with `store_event` " +
  "(source: user or assistant, a stable `type:name` context_id). Skip anything already in " +
  "CLAUDE.md, AGENTS.md or git history. If nothing qualifies, store nothing.";

export function recallInstruction(workspace: Workspace): string {
  return (
    "LocusGraph: before starting the user's first task, call the LocusGraph `retrieve_memories` " +
    `tool once with these arguments: ${JSON.stringify(recallArguments(workspace))}. ` +
    "Treat what it returns as background on this repository and do not repeat the call for it. " +
    "If the LocusGraph tools are not available, skip this."
  );
}

export interface RecallOptions {
  readonly afterCompact: boolean;
  readonly fetch?: FetchMemories;
  readonly workspace?: Workspace;
}

function hasRestCredentials(env: LocusGraphEnv): boolean {
  return env.token !== undefined && env.graphId !== undefined;
}

async function recallSection(env: LocusGraphEnv, workspace: Workspace, fetch: FetchMemories) {
  if (!hasRestCredentials(env)) return recallInstruction(workspace);
  const memories = await fetch(env, workspace);
  return memories === "" ? "" : `LocusGraph memories for this workspace:\n${memories}`;
}

export async function recall(
  input: HookInput,
  env: LocusGraphEnv,
  { afterCompact, fetch = fetchMemories, workspace }: RecallOptions,
): Promise<CommandResult> {
  const sections = [
    await recallSection(env, workspace ?? describeWorkspace(input.cwd || process.cwd()), fetch),
    afterCompact ? STORE_AFTER_COMPACT : "",
  ].filter((section) => section !== "");

  return sections.length === 0
    ? { exitCode: 0 }
    : { exitCode: 0, stdout: `${sections.join("\n\n")}\n` };
}

import { type FetchMemories, fetchMemories } from "../engine.ts";
import type { LocusGraphEnv } from "../env.ts";
import { type HookInput, hookCwd } from "../hook-input.ts";
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
  // Cursor reads sessionStart output as JSON: { additional_context }. Everything else reads text.
  readonly cursor?: boolean;
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

// Names the repository's graph, so the agent can tell the user when its LocusGraph tools were
// signed in to another one: the tools use the graph chosen at sign-in, not this file.
export function repoGraphNote(env: LocusGraphEnv): string {
  if (env.graphSource !== "repo" || env.graphId === undefined) return "";
  return (
    `LocusGraph: this repository's graph is \`${env.graphId}\` (from .locusgraph.json). ` +
    "The LocusGraph tools read and write the graph chosen when they were signed in; if the " +
    "user expects memories here to go to this graph and the tools use another, say so."
  );
}

export async function recall(
  input: HookInput,
  env: LocusGraphEnv,
  { afterCompact, cursor = false, fetch = fetchMemories, workspace }: RecallOptions,
): Promise<CommandResult> {
  const sections = [
    repoGraphNote(env),
    await recallSection(env, workspace ?? describeWorkspace(hookCwd(input)), fetch),
    afterCompact ? STORE_AFTER_COMPACT : "",
  ].filter((section) => section !== "");

  const text = sections.join("\n\n");
  if (cursor) {
    return {
      exitCode: 0,
      stdout: `${JSON.stringify(text === "" ? {} : { additional_context: text })}\n`,
    };
  }
  return text === "" ? { exitCode: 0 } : { exitCode: 0, stdout: `${text}\n` };
}

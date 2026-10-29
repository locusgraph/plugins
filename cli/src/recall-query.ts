import type { Workspace } from "./workspace.ts";

export interface RecallArguments {
  readonly query: string;
  readonly limit: number;
  readonly format: "toon";
  readonly boost_context_ids: readonly string[];
}

export function recallArguments({ repo, query }: Workspace): RecallArguments {
  return {
    query,
    limit: 6,
    format: "toon",
    boost_context_ids: [`project:${repo}`, `handoff:${repo}`],
  };
}

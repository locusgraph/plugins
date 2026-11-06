import type { Workspace } from "./workspace.ts";

export interface RecallArguments {
  readonly query: string;
  readonly limit: number;
  readonly format: "toon";
  readonly boost_context_ids: readonly string[];
  readonly coverage_context_ids: readonly string[];
}

// Boost only adds candidates, so a generic query can crowd the handoff out. Coverage reserves
// part of the window for it.
export function recallArguments({ repo, query }: Workspace): RecallArguments {
  return {
    query,
    limit: 6,
    format: "toon",
    boost_context_ids: [`project:${repo}`],
    coverage_context_ids: [`handoff:${repo}`],
  };
}

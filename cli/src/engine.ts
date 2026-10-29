import type { LocusGraphEnv } from "./env.ts";
import { recallArguments } from "./recall-query.ts";
import type { Workspace } from "./workspace.ts";

const RECALL_TIMEOUT_MS = 4000;

export type FetchMemories = (env: LocusGraphEnv, workspace: Workspace) => Promise<string>;

export const fetchMemories: FetchMemories = async (env, workspace) => {
  if (env.token === undefined || env.graphId === undefined) return "";
  try {
    const response = await fetch(`${env.engineUrl}/v1/memories`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.token}`, "content-type": "application/json" },
      body: JSON.stringify({ graph_id: env.graphId, ...recallArguments(workspace) }),
      signal: AbortSignal.timeout(RECALL_TIMEOUT_MS),
    });
    if (!response.ok) return "";
    const body = (await response.json()) as { data?: { memories?: unknown } };
    return typeof body.data?.memories === "string" ? body.data.memories.trim() : "";
  } catch {
    return "";
  }
};

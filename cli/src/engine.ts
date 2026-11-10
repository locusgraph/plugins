import type { LocusGraphEnv } from "./env.ts";
import { recallArguments } from "./recall-query.ts";
import type { Workspace } from "./workspace.ts";

const RECALL_TIMEOUT_MS = 4000;
const SKILL_MATCH_TIMEOUT_MS = 2500;

// A skill is suggested only when its similarity to the prompt reaches this score. Lower values
// suggest a skill on loosely related prompts, which turns the hint into noise.
export const SKILL_MATCH_MIN_SCORE = 0.6;

export type RetrieveResult =
  | { readonly ok: true; readonly data: Record<string, unknown> }
  | { readonly ok: false; readonly status: number };

// POST /v1/memories, the free retrieve endpoint. Never throws: a network failure or timeout is
// status 0.
export async function retrieve(
  env: LocusGraphEnv,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<RetrieveResult> {
  if (env.token === undefined || env.graphId === undefined) return { ok: false, status: 0 };
  try {
    const response = await fetch(`${env.engineUrl}/v1/memories`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.token}`, "content-type": "application/json" },
      body: JSON.stringify({ graph_id: env.graphId, ...body }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return { ok: false, status: response.status };
    const json = (await response.json()) as { data?: unknown };
    const data = json.data;
    return typeof data === "object" && data !== null
      ? { ok: true, data: data as Record<string, unknown> }
      : { ok: false, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

export type FetchMemories = (env: LocusGraphEnv, workspace: Workspace) => Promise<string>;

export const fetchMemories: FetchMemories = async (env, workspace) => {
  const result = await retrieve(env, { ...recallArguments(workspace) }, RECALL_TIMEOUT_MS);
  if (!result.ok) return "";
  const memories = result.data.memories;
  return typeof memories === "string" ? memories.trim() : "";
};

export interface SkillMatch {
  readonly contextId: string;
  readonly text: string;
  readonly score: number;
}

export type MatchSkill = (
  env: LocusGraphEnv,
  prompt: string,
) => Promise<SkillMatch | undefined>;

// The stored skill that best fits a prompt, scored on similarity alone so a fresh but unrelated
// skill does not rank by recency.
export const matchSkill: MatchSkill = async (env, prompt) => {
  const result = await retrieve(
    env,
    {
      query: prompt,
      context_types: { skill: [] },
      ranking: "similarity",
      format: "json",
      limit: 3,
    },
    SKILL_MATCH_TIMEOUT_MS,
  );
  if (!result.ok || !Array.isArray(result.data.items)) return undefined;

  let best: SkillMatch | undefined;
  for (const item of result.data.items as unknown[]) {
    if (typeof item !== "object" || item === null) continue;
    const { context_ids: ids, text, match_score: score } = item as Record<string, unknown>;
    if (typeof text !== "string" || typeof score !== "number" || !Array.isArray(ids)) continue;
    const contextId = ids.find(
      (id): id is string => typeof id === "string" && id.startsWith("skill:"),
    );
    if (contextId === undefined || score < SKILL_MATCH_MIN_SCORE) continue;
    if (best === undefined || score > best.score) best = { contextId, text, score };
  }
  return best;
};
